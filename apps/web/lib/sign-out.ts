/**
 * 调 better-auth 的 sign-out 端点清除 session cookie。
 *
 * 抽成纯函数（输入 fetchImpl）是为了在不引入 RTL/jsdom 全家桶的前提下用
 * vitest 单测覆盖三个分支（正常 / 4xx / 网络异常）。组件层只负责把结果
 * 翻译成 UI state（按钮 disabled / 跳转 / console.error）。
 *
 * 关键契约：better-auth 的 POST 端点要求 Content-Type: application/json
 * + JSON body，缺一律返 415 不下发清 cookie 的 Set-Cookie，看起来"登出
 * 没效果"。修改本函数的请求形态前请确认 better-auth 仍接受。
 */
export type SignOutResult =
  | { status: 'ok' }
  | { status: 'failed'; httpStatus: number; detail: string }
  | { status: 'network_error'; error: unknown };

export async function performSignOut(fetchImpl: typeof fetch = fetch): Promise<SignOutResult> {
  try {
    const res = await fetchImpl('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) return { status: 'ok' };
    const detail = await res.text().catch(() => '');
    return { status: 'failed', httpStatus: res.status, detail: detail.slice(0, 200) };
  } catch (error) {
    return { status: 'network_error', error };
  }
}
