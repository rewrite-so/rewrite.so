import { type MountOptions, mount } from '@rewrite/core';
import { type Locale, pickLocale } from '@rewrite/shared';
import { WEB_BASE } from '../lib/config.ts';
import {
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
