import type { StoredLocale } from '@rewrite/shared/locales';

/**
 * chrome.storage 封装。
 *
 * 关键约定（CLAUDE.md 已记录）：
 * - 所有 key 带 `_v: 1` schema 版本字段（跨版本兼容时新字段读旧值）
 * - installId 永不重置（包括登录后；登录后由 inject.ts 调 claimInstallQuota
 *   触发 POST /v1/me/claim-install 一次性 merge 当月配额到 user 维度）
 */

const STORAGE_KEY_INSTALL_ID = 'installId';
const STORAGE_KEY_PREFS = 'userPrefs';

export interface UserPrefs {
  _v: 1;
  /** 'auto' = 自动检测页面语言；其它为固定 BCP-47 */
  targetLang: string;
  /** 'auto' = 跟随 navigator.language；具体 locale 强制 */
  uiLocale: StoredLocale;
  /** 是否启用双击 Shift 触发；用户可在 options 关掉 */
  triggerEnabled: boolean;
  /** onboarding 完成与否 */
  hasCompletedOnboarding: boolean;
  /** dot 首次自动 popup tooltip 是否已展示过；用一次后置 true */
  hasSeenDotTooltip: boolean;
}

export const DEFAULT_PREFS: UserPrefs = {
  _v: 1,
  targetLang: 'auto',
  uiLocale: 'auto',
  triggerEnabled: true,
  hasCompletedOnboarding: false,
  hasSeenDotTooltip: false,
};

interface InstallIdRecord {
  _v: 1;
  id: string;
}

export async function getOrCreateInstallId(): Promise<string> {
  const got = await chrome.storage.local.get(STORAGE_KEY_INSTALL_ID);
  const existing = got[STORAGE_KEY_INSTALL_ID] as InstallIdRecord | undefined;
  if (existing?.id) return existing.id;

  const id = crypto.randomUUID();
  const record: InstallIdRecord = { _v: 1, id };
  await chrome.storage.local.set({ [STORAGE_KEY_INSTALL_ID]: record });
  return id;
}

export async function getUserPrefs(): Promise<UserPrefs> {
  const got = await chrome.storage.local.get(STORAGE_KEY_PREFS);
  const existing = got[STORAGE_KEY_PREFS] as Partial<UserPrefs> | undefined;
  if (!existing) return { ...DEFAULT_PREFS };
  // 缺字段用默认值兜底（schema 兼容）
  return { ...DEFAULT_PREFS, ...existing, _v: 1 };
}

export async function patchUserPrefs(patch: Partial<UserPrefs>): Promise<UserPrefs> {
  const current = await getUserPrefs();
  const next: UserPrefs = { ...current, ...patch, _v: 1 };
  await chrome.storage.local.set({ [STORAGE_KEY_PREFS]: next });
  // 同步到 web /v1/me/settings —— 仅 targetLang / uiLocale 字段，且只有登录用户
  // 才能 PATCH 成功（401 静默忽略，意味着用户未登录，prefs 仅本地有效）
  if (patch.targetLang !== undefined || patch.uiLocale !== undefined) {
    void patchCloudPrefs({
      ...(patch.targetLang !== undefined ? { targetLang: patch.targetLang } : {}),
      ...(patch.uiLocale !== undefined ? { uiLocale: patch.uiLocale } : {}),
    });
  }
  return next;
}

/**
 * 从 web /v1/me/settings 拉偏好（通过 background SW，避免 content script 跨域）。
 * 用户已登录返回 prefs 子集；未登录或网络错误返 null。
 */
export async function fetchCloudPrefs(): Promise<Pick<
  UserPrefs,
  'targetLang' | 'uiLocale'
> | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'me-settings:get' },
        (res: { ok?: boolean; data?: { targetLang: string; uiLocale: StoredLocale } }) => {
          if (chrome.runtime.lastError || !res?.ok || !res.data) {
            resolve(null);
            return;
          }
          resolve({ targetLang: res.data.targetLang, uiLocale: res.data.uiLocale });
        },
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * 触发"匿名 install 配额合并到登录用户"。inject.ts bootstrap 时若 user 已登录则调一次：
 * 服务端通过 usage_claims 表（user_id, source_kind, source_id, month_utc）做幂等，
 * 重复调用 no-op。fail-soft，未登录返 401 → 静默 false。
 */
export async function claimInstallQuota(installId: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'claim-install', installId }, (res: { ok?: boolean }) => {
        resolve(!chrome.runtime.lastError && res?.ok === true);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * 推送偏好到 web（通过 background SW）。fail-soft：成功 / 失败均不抛异常，
 * 调用方不阻塞 local 写入流程。
 *
 * 注：自 d9cf3e9 起，登录用户在 extension options 不再编辑 targetLang/uiLocale
 * （改在 web /settings 唯一入口管理），此函数实际只在匿名 patchUserPrefs 路径
 * 触发——而匿名调返 401 无副作用。保留以便未来如果给登录用户加快捷入口（如
 * popup 切语言）能直接复用，不必再加 SW handler。
 */
export async function patchCloudPrefs(
  patch: Partial<Pick<UserPrefs, 'targetLang' | 'uiLocale'>>,
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'me-settings:patch', body: patch },
        (res: { ok?: boolean }) => {
          resolve(!chrome.runtime.lastError && res?.ok === true);
        },
      );
    } catch {
      resolve(false);
    }
  });
}

/**
 * 监听 prefs 变化（options 修改时通知 content script 重新读取）。
 * 返回 unsubscribe。
 */
export function onPrefsChanged(cb: (prefs: UserPrefs) => void): () => void {
  const handler = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== 'local') return;
    if (!changes[STORAGE_KEY_PREFS]) return;
    const next = changes[STORAGE_KEY_PREFS].newValue as Partial<UserPrefs> | undefined;
    cb({ ...DEFAULT_PREFS, ...(next ?? {}), _v: 1 });
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
