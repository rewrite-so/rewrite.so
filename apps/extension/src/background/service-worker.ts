import { API_BASE } from '../lib/config.ts';
import { type FromBackground, type FromContent, PORT_NAME_REWRITE } from '../lib/port-protocol.ts';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// content script / popup / options 页面通过 sendMessage 让 background 代理：
// - open-options：调 chrome.runtime.openOptionsPage()（content script 没这个 API）
// - me-settings:get / patch：跨域 fetch /v1/me/settings（host_permissions 在 background）
// - me-usage:get：跨域 fetch /v1/me/usage（同上；popup 直接 fetch 拿不到
//   better-auth session cookie——SameSite=Lax 不跨站走子资源请求，需 SW 代理）
// - me:get：跨域 fetch /v1/me（options 探测登录态决定渲染哪个分支）
// - claim-install：跨域 POST /v1/me/claim-install
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

  if (msg?.type === 'claim-install') {
    const installId = (msg as { installId?: string }).installId;
    if (typeof installId !== 'string' || installId.length === 0) {
      sendResponse({ ok: false, error: 'invalid_install_id' });
      return false;
    }
    fetch(`${API_BASE}/v1/me/claim-install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ installId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ ok: false, error: `http_${res.status}` });
          return;
        }
        const data = (await res.json()) as { merged: number; applied: boolean };
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
  }

  if (msg?.type === 'me:get') {
    fetch(`${API_BASE}/v1/me`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ ok: false, error: `http_${res.status}` });
          return;
        }
        const data = (await res.json()) as {
          user: {
            id: string;
            email: string;
            name: string | null;
            image: string | null;
          } | null;
          tier?: 'free' | 'pro';
        };
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
  }

  if (msg?.type === 'me-usage:get') {
    const installId = (msg as { installId?: string }).installId;
    const qs =
      typeof installId === 'string' && installId.length > 0
        ? `?installId=${encodeURIComponent(installId)}`
        : '';
    fetch(`${API_BASE}/v1/me/usage${qs}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ ok: false, error: `http_${res.status}` });
          return;
        }
        const data = (await res.json()) as {
          used: number;
          limit: number;
          remaining: number;
          resetAt: string;
          tier: 'anonymous' | 'anonymous_install' | 'free' | 'pro';
        };
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: (err as Error).message }));
    return true;
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
  // 隐私契约（CLAUDE.md L44）：日志不得携带原文 / 输出文本 / 用户访问的 URL。
  // sender.url（用户当前在哪个网站）和 msg.req.text（待改写原文）都属于不可记录范畴——
  // 即便只在 chrome devtools 本地显示，用户截图分享时会暴露。这里只记不可识别的
  // port name + 长度统计。
  console.info('[rewrite.so/bg] port connect', port.name);
  if (port.name !== PORT_NAME_REWRITE) return;

  const ac = new AbortController();

  port.onDisconnect.addListener(() => {
    console.info('[rewrite.so/bg] port disconnect');
    ac.abort();
  });

  port.onMessage.addListener((raw: unknown) => {
    const msg = raw as FromContent;
    if (msg.type !== 'rewrite') return;
    console.info('[rewrite.so/bg] rewrite request len=', msg.req.text.length);
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
      headers: { 'content-type': 'application/json', 'x-rewrite-client': 'extension' },
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
    // 更精确的 error code 映射（从 4xx/5xx body 解析 server 端 error code）
    let code: string;
    if (res.status === 401) code = 'unauthorized';
    else if (res.status === 403) code = 'forbidden';
    else if (res.status === 503 && detail.includes('upstream_not_configured'))
      code = 'upstream_not_configured';
    else if (res.status === 429)
      code = detail.includes('quota_exceeded') ? 'quota_exceeded' : 'rate_limit';
    else if (res.status === 413) code = 'input_too_long';
    else code = 'upstream_error';

    // 解析 4xx body 透传 authed / tier / used / limit / resetAt 给 content。
    // 服务端 quota_exceeded 路径会带 authed/tier 让 content 决定 CTA 文案；
    // 没有这一步 detail.authed 永远 undefined，登录用户也会看到 "Sign in for more"。
    const extras: {
      authed?: boolean;
      tier?: string;
      used?: number;
      limit?: number;
      resetAt?: string;
    } = {};
    try {
      const body = JSON.parse(detail) as Record<string, unknown>;
      if (typeof body.authed === 'boolean') extras.authed = body.authed;
      if (typeof body.tier === 'string') extras.tier = body.tier;
      if (typeof body.used === 'number') extras.used = body.used;
      if (typeof body.limit === 'number') extras.limit = body.limit;
      if (typeof body.resetAt === 'string') extras.resetAt = body.resetAt;
    } catch {
      // body 非 JSON（如 503 文本错误），保持空 extras
    }
    send({
      type: 'error',
      code,
      status: res.status,
      message: detail.slice(0, 500),
      ...extras,
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
