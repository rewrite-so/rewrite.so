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

async function bootstrap(): Promise<void> {
  // 启动时尝试从 web /v1/me/settings 拉偏好覆盖本地 cache —— 让用户在 web /settings
  // 改的偏好（targetLang / uiLocale）能在扩展生效。已登录拿到值，未登录返 null 不动。
  // 注：不阻塞 mount —— cloud sync 失败不影响本地体验
  const cloud = await fetchCloudPrefs();
  if (cloud) {
    // 注意：patchUserPrefs 内部又会调 patchCloudPrefs —— 这里读的就是 cloud，
    // 再 PATCH 回去是 noop（值相同）；用 chrome.storage.local 直接写避免 echo
    const current = await getUserPrefs();
    if (current.targetLang !== cloud.targetLang || current.uiLocale !== cloud.uiLocale) {
      await chrome.storage.local.set({
        userPrefs: { ...current, ...cloud, _v: 1 as const },
      });
    }
  }

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
