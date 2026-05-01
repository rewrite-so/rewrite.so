/**
 * chrome.storage 封装。
 *
 * 关键约定（CLAUDE.md 已记录）：
 * - 所有 key 带 `_v: 1` schema 版本字段（跨版本兼容时新字段读旧值）
 * - installId 永不重置（包括登录后；登录会做 usage_monthly 一次性 merge）
 */

const STORAGE_KEY_INSTALL_ID = 'installId';
const STORAGE_KEY_PREFS = 'userPrefs';

export interface UserPrefs {
  _v: 1;
  /** 'auto' = 自动检测页面语言；其它为固定 BCP-47 */
  targetLang: string;
  /** 'auto' = 跟随 navigator.language；'zh-CN' / 'en' 强制 */
  uiLocale: 'zh-CN' | 'en' | 'auto';
  /** 是否启用双击 Shift 触发；用户可在 options 关掉 */
  triggerEnabled: boolean;
  /** onboarding 完成与否 */
  hasCompletedOnboarding: boolean;
}

export const DEFAULT_PREFS: UserPrefs = {
  _v: 1,
  targetLang: 'auto',
  uiLocale: 'auto',
  triggerEnabled: true,
  hasCompletedOnboarding: false,
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
  return next;
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
