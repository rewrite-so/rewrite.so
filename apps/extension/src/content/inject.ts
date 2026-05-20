import { type MountHandle, type MountOptions, mount } from '@rewrite/core';
import { type Locale, pickLocale } from '@rewrite/shared/locales';
import { WEB_BASE } from '../lib/config.ts';
import { initEvents, trackEvent } from '../lib/events.ts';
import { detectSite } from '../lib/site-detect.ts';
import {
  claimInstallQuota,
  fetchCloudPrefs,
  getOrCreateInstallId,
  getUserPrefs,
  onPrefsChanged,
  patchUserPrefs,
  type UserPrefs,
} from '../lib/storage.ts';
import { createPortApiClient } from './port-client.ts';

function resolveUiLocale(prefs: UserPrefs): Locale {
  if (prefs.uiLocale === 'auto') return pickLocale(navigator.language);
  return prefs.uiLocale;
}

/**
 * 取 events kill switch（GET /v1/me 的 eventsEnabled 字段，经 background SW 代理）。
 * 失败默认 true —— 服务端 EVENTS_DISABLED 仍是硬关停，前端 gate 只是少发一次请求的优化。
 */
function fetchEventsEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'me:get' },
        (res: { ok?: boolean; data?: { eventsEnabled?: boolean } }) => {
          if (chrome.runtime.lastError || !res?.ok) {
            resolve(true);
            return;
          }
          resolve(res.data?.eventsEnabled !== false);
        },
      );
    } catch {
      resolve(true);
    }
  });
}

/**
 * 拉 cloud → 覆盖 chrome.storage cache（如果有变化）。chrome.storage.set 会触发
 * onPrefsChanged → mount/unmount 自动 reflow，不需要手动重 mount。
 * fail-soft：未登录或网络错误返 null，跳过写入。
 *
 * 返回 true 表示用户已登录（cloud 拉成功），false 表示未登录或失败。
 */
async function syncFromCloud(): Promise<boolean> {
  const cloud = await fetchCloudPrefs();
  if (!cloud) return false;
  const current = await getUserPrefs();
  if (current.targetLang !== cloud.targetLang || current.uiLocale !== cloud.uiLocale) {
    await chrome.storage.local.set({
      userPrefs: { ...current, ...cloud, _v: 1 as const },
    });
  }
  return true;
}

const VISIBILITY_SYNC_THROTTLE_MS = 30_000;

async function bootstrap(): Promise<void> {
  const [prefs, installId] = await Promise.all([getUserPrefs(), getOrCreateInstallId()]);
  const apiClient = createPortApiClient();
  let currentPrefs = prefs;

  // 初始化扩展端 events sender。site 由 hostname 粗粒度映射（绝不发真实 URL）；
  // eventsEnabled kill switch 经 /v1/me 取（失败默认开，服务端 EVENTS_DISABLED 兜底）。
  void fetchEventsEnabled().then((eventsEnabled) => {
    initEvents({
      installId,
      site: detectSite(location.hostname),
      locale: resolveUiLocale(prefs),
      eventsEnabled,
    });
  });
  let suppressNextTargetLangRemount = false;
  let claimedInstallQuota = false;
  let claimInFlight = false;

  const syncAndClaim = async () => {
    const isAuthed = await syncFromCloud();
    if (isAuthed && !claimedInstallQuota && !claimInFlight) {
      claimInFlight = true;
      void claimInstallQuota(installId)
        .then((ok) => {
          claimedInstallQuota = ok;
        })
        .finally(() => {
          claimInFlight = false;
        });
    }
  };

  // 启动时拉 cloud 偏好，但不阻塞 mount；未登录或网络失败都不影响本地体验。
  void syncAndClaim();

  // 标签页重新可见时再 sync 一次（节流 30s），让用户在 web 改完偏好切回当前标签页时
  // 立即拿到新值——不用刷新页面。chrome.storage.onChanged 会触发现有 mount 重新挂载。
  let lastSync = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (Date.now() - lastSync < VISIBILITY_SYNC_THROTTLE_MS) return;
    lastSync = Date.now();
    void syncAndClaim();
  });

  const buildOpts = (p: UserPrefs): MountOptions => ({
    host: 'extension',
    apiClient,
    shadowMode: 'closed',
    userPrefLang: p.targetLang,
    uiLocale: resolveUiLocale(p),
    installId,
    loginUrl: `${WEB_BASE}/login`,
    // 超配额 CTA 跳 /billing 而非 /settings：营销页直接列定价 / Subscribe 按钮，
    // 转化路径最短。/settings 是配置页，upgrade 链接埋在订阅区块里，UX 错位
    upgradeUrl: `${WEB_BASE}/billing?from=quota_exceeded`,
    // 实时跨端同步：服务端在 SSE meta.status 里 echo user_settings.target_lang，
    // 扩展把它写回 chrome.storage（如果与本地 cache 不同）。下次 inject 重 mount
    // 时直接拿到新值——避免等 30s visibilitychange 节流
    onUserPrefsSync: ({ targetLang }) => {
      if (targetLang !== currentPrefs.targetLang) {
        // 这是服务端 -> 本地 cache 的反向同步，不 PATCH 回源头，避免无限循环。
        suppressNextTargetLangRemount = true;
        void chrome.storage.local.set({
          userPrefs: { ...currentPrefs, targetLang, _v: 1 as const },
        });
      }
    },
    // content script 不能直接调 chrome.runtime.openOptionsPage()（API 不存在 in isolated world）
    // 走 sendMessage → background SW 代为打开
    onOpenSettings: () => {
      chrome.runtime.sendMessage({ type: 'open-options' });
    },
    // 首次聚焦输入框时让 dot 自动 popup tooltip 介绍快捷键 + 品牌；popup 触发瞬间
    // 立即落 flag（不等 4s 淡出），避免 4s 内 unmount/remount 让 tooltip 显示两次。
    showFirstDotTooltip: !p.hasSeenDotTooltip,
    onFirstDotTooltipShown: () => {
      void patchUserPrefs({ hasSeenDotTooltip: true });
    },
    // ---- user-behavior events（core 生命周期回调 → Phase 3 sender → SW → /v1/events）----
    onTrigger: ({ hasSelection }) => {
      trackEvent('ext_trigger', { has_selection: hasSelection ? 1 : 0 });
    },
    onAccepted: (style) => {
      trackEvent('ext_accept', { style });
    },
    onRegenerate: (style) => {
      trackEvent('ext_regenerate', { style });
    },
    onDismiss: () => {
      trackEvent('ext_dismiss');
    },
    onWriteLayer: ({ layer, framework }) => {
      trackEvent('rewrite_write_layer', { layer, framework });
    },
  });

  let handle: MountHandle | null = prefs.triggerEnabled ? mount(buildOpts(prefs)) : null;

  onPrefsChanged((next) => {
    // triggerEnabled / uiLocale 变化必然重挂；targetLang 是 mount 初始化参数，用户在
    // options 里本地修改时也要重挂。服务端 SSE meta.status 的反向同步只更新 cache，
    // 不打断当前正在进行的流。
    const triggerChanged = next.triggerEnabled !== currentPrefs.triggerEnabled;
    const uiLocaleChanged = next.uiLocale !== currentPrefs.uiLocale;
    const targetLangChanged = next.targetLang !== currentPrefs.targetLang;
    const suppressTargetOnly =
      suppressNextTargetLangRemount && targetLangChanged && !triggerChanged && !uiLocaleChanged;
    suppressNextTargetLangRemount = false;
    currentPrefs = next;
    if (!triggerChanged && !uiLocaleChanged && (!targetLangChanged || suppressTargetOnly)) return;

    handle?.unmount();
    handle = null;
    if (!next.triggerEnabled) return;
    handle = mount(buildOpts(next));
  });
}

bootstrap().catch((err) => {
  console.warn('[rewrite.so] content bootstrap failed', err);
});
