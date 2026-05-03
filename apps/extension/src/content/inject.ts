import { type MountOptions, mount } from '@rewrite/core';
import { type Locale, pickLocale } from '@rewrite/shared';
import { WEB_BASE } from '../lib/config.ts';
import {
  fetchCloudPrefs,
  getOrCreateInstallId,
  getUserPrefs,
  onPrefsChanged,
  type UserPrefs,
} from '../lib/storage.ts';
import { createPortApiClient } from './port-client.ts';

function resolveUiLocale(prefs: UserPrefs): Locale {
  if (prefs.uiLocale === 'auto') return pickLocale(navigator.language);
  return prefs.uiLocale;
}

/**
 * 拉 cloud → 覆盖 chrome.storage cache（如果有变化）。chrome.storage.set 会触发
 * onPrefsChanged → mount/unmount 自动 reflow，不需要手动重 mount。
 * fail-soft：未登录或网络错误返 null，跳过写入。
 */
async function syncFromCloud(): Promise<void> {
  const cloud = await fetchCloudPrefs();
  if (!cloud) return;
  const current = await getUserPrefs();
  if (current.targetLang === cloud.targetLang && current.uiLocale === cloud.uiLocale) return;
  await chrome.storage.local.set({
    userPrefs: { ...current, ...cloud, _v: 1 as const },
  });
}

const VISIBILITY_SYNC_THROTTLE_MS = 30_000;

async function bootstrap(): Promise<void> {
  // 启动时尝试从 web /v1/me/settings 拉偏好覆盖本地 cache —— 让用户在 web /settings
  // 改的偏好能在扩展立即生效。已登录拿到值，未登录返 null 不动。
  // 注：不阻塞 mount —— cloud sync 失败不影响本地体验
  await syncFromCloud();

  // 标签页重新可见时再 sync 一次（节流 30s），让用户在 web 改完偏好切回当前标签页时
  // 立即拿到新值——不用刷新页面。chrome.storage.onChanged 会触发现有 mount 重新挂载。
  let lastSync = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (Date.now() - lastSync < VISIBILITY_SYNC_THROTTLE_MS) return;
    lastSync = Date.now();
    void syncFromCloud();
  });

  const [prefs, installId] = await Promise.all([getUserPrefs(), getOrCreateInstallId()]);
  if (!prefs.triggerEnabled) return;

  const apiClient = createPortApiClient();

  const buildOpts = (p: UserPrefs): MountOptions => ({
    host: 'extension',
    apiClient,
    shadowMode: 'closed',
    userPrefLang: p.targetLang,
    uiLocale: resolveUiLocale(p),
    installId,
    loginUrl: `${WEB_BASE}/login`,
    // content script 不能直接调 chrome.runtime.openOptionsPage()（API 不存在 in isolated world）
    // 走 sendMessage → background SW 代为打开
    onOpenSettings: () => {
      chrome.runtime.sendMessage({ type: 'open-options' });
    },
  });

  let handle = mount(buildOpts(prefs));

  onPrefsChanged((next) => {
    handle.unmount();
    if (!next.triggerEnabled) return;
    handle = mount(buildOpts(next));
  });
}

bootstrap().catch((err) => {
  console.warn('[rewrite.so] content bootstrap failed', err);
});
