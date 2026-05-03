import { API_BASE } from '../lib/config.ts';
import { type FromBackground, type FromContent, PORT_NAME_REWRITE } from '../lib/port-protocol.ts';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// content script / options 页面通过 sendMessage 让 background 代理：
// - open-options：调 chrome.runtime.openOptionsPage()（content script 没这个 API）
// - me-settings:get / patch：跨域 fetch /v1/me/settings（host_permissions 在 background）
chrome.runtime.onMessage.addListener((rawMsg: unknown, _sender, sendResponse) => {
  const msg = rawMsg as { type?: string; body?: unknown };

  if (msg?.type === 'open-options') {
    chrome.runtime.openOptionsPage();
    return false; // 同步处理，不需要 sendResponse
  }

  if (msg?.type === 'me-settings:get') {
    fetch(`${API_BASE}/v1/me/settings`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ ok: false, error: `http_${res.status}` });
          return;
        }
        const data = (await res.json()) as { targetLang: string; uiLocale: string };
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true; // 异步响应
  }

  if (msg?.type === 'me-settings:patch') {
    fetch(`${API_BASE}/v1/me/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(msg.body ?? {}),
    })
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ ok: false, error: `http_${res.status}` });
          return;
        }
        const data = (await res.json()) as { targetLang: string; uiLocale: string };
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
  }

  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  console.info('[rewrite.so/bg] port connect', port.name, 'sender:', port.sender?.url);
  if (port.name !== PORT_NAME_REWRITE) return;

  const ac = new AbortController();

  port.onDisconnect.addListener(() => {
    console.info('[rewrite.so/bg] port disconnect');
    ac.abort();
  });

  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as FromContent;
    if (msg.type !== 'rewrite') return;
    console.info('[rewrite.so/bg] rewrite request', msg.req.text.slice(0, 40));
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
    console.info('[rewrite.so/bg] fetch', `${API_BASE}/v1/rewrite`);
    res = await fetch(`${API_BASE}/v1/rewrite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg.req),
      signal,
      credentials: 'include',
    });
    console.info('[rewrite.so/bg] fetch ok status=', res.status);
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    console.warn('[rewrite.so/bg] fetch failed:', (err as Error).message, err);
    send({ type: 'error', code: 'network', message: (err as Error).message });
    send({ type: 'end' });
    return;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn('[rewrite.so/bg] non-2xx', res.status, detail.slice(0, 200));
    // 把 api 返回的原始 JSON 直接透传给 content（detailObj 能拿到 used/limit/resetAt 等）
    send({
      type: 'error',
      code:
        res.status === 429
          ? detail.includes('quota_exceeded')
            ? 'quota_exceeded'
            : 'rate_limit'
          : res.status === 413
            ? 'input_too_long'
            : 'upstream_error',
      status: res.status,
      message: detail.slice(0, 500),
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
