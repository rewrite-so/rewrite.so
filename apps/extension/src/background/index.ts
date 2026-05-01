import { type FromBackground, type FromContent, PORT_NAME_REWRITE } from '../lib/port-protocol.ts';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:8787';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME_REWRITE) return;

  const ac = new AbortController();

  port.onDisconnect.addListener(() => {
    ac.abort();
  });

  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as FromContent;
    if (msg.type !== 'rewrite') return;
    void handleRewrite(port, msg, ac.signal);
  });
});

async function handleRewrite(
  port: chrome.runtime.Port,
  msg: FromContent,
  signal: AbortSignal,
): Promise<void> {
  const send = (m: FromBackground) => {
    try {
      port.postMessage(m);
    } catch {
      // port already closed
    }
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/v1/rewrite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg.req),
      signal,
      credentials: 'include',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    send({ type: 'error', code: 'network', message: (err as Error).message });
    send({ type: 'end' });
    return;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    send({
      type: 'error',
      code:
        res.status === 429
          ? 'rate_limit'
          : res.status === 413
            ? 'input_too_long'
            : 'upstream_error',
      status: res.status,
      message: detail.slice(0, 200),
    });
    send({ type: 'end' });
    return;
  }

  if (!res.body) {
    send({ type: 'error', code: 'upstream_error', message: 'empty body' });
    send({ type: 'end' });
    return;
  }

  const reader = res.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (signal.aborted) return;
      // Uint8Array 不能直接 postMessage（部分 Chromium 版本对 transferable 行为不一致），
      // 序列化为 number[]，content 端再 new Uint8Array() 还原。
      send({ type: 'chunk', data: Array.from(value) });
    }
    send({ type: 'end' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    send({ type: 'error', code: 'network', message: (err as Error).message });
    send({ type: 'end' });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}
