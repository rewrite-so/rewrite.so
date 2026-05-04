/**
 * 探测登录态：通过 background SW 代理 GET /v1/me，避免 popup/options 跨站
 * SameSite=Lax 拿不到 better-auth session cookie。
 *
 * 返回 user=null 视为匿名（包括网络错误 fail-soft）。
 */
export interface MeUser {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

export interface MeResponse {
  user: MeUser | null;
  tier?: 'free' | 'pro';
  subscription?: {
    plan: string;
    status: string;
    currentPeriodEnd: number;
    cancelAtPeriodEnd: boolean;
  } | null;
}

export async function fetchMe(): Promise<MeResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'me:get' },
        (res: { ok?: boolean; data?: MeResponse } | undefined) => {
          if (chrome.runtime.lastError || !res?.ok || !res.data) {
            resolve({ user: null });
            return;
          }
          resolve(res.data);
        },
      );
    } catch {
      resolve({ user: null });
    }
  });
}
