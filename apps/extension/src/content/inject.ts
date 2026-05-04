import { type MountOptions, mount } from '@rewrite/core';
import { type Locale, pickLocale } from '@rewrite/shared/locales';
import { WEB_BASE } from '../lib/config.ts';
import {
  claimInstallQuota,
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
  // 启动时尝试从 web /v1/me/settings 拉偏好覆盖本地 cache —— 让用户在 web /settings
  // 改的偏好能在扩展立即生效。已登录拿到值，未登录返 null 不动。
  // 注：不阻塞 mount —— cloud sync 失败不影响本地体验
  const isAuthed = await syncFromCloud();

  // 已登录用户：把当月匿名 install 配额合并到 user 维度（兑现 CLAUDE.md 承诺，
  // 防匿名→注册薅档位）。服务端 usage_claims PK 幂等，重复调用 no-op；这里
  // fail-soft 不阻塞 mount。每次 bootstrap 都会调一次 —— 单次 D1 query 成本可忽略。
  if (isAuthed) {
    const id = await getOrCreateInstallId();
    void claimInstallQuota(id);
  }

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
    // 超配额 CTA 跳 /billing 而非 /settings：营销页直接列定价 / Subscribe 按钮，
    // 转化路径最短。/settings 是配置页，upgrade 链接埋在订阅区块里，UX 错位
    upgradeUrl: `${WEB_BASE}/billing?from=quota_exceeded`,
    // 实时跨端同步：服务端在 SSE meta.status 里 echo user_settings.target_lang，
    // 扩展把它写回 chrome.storage（如果与本地 cache 不同）。下次 inject 重 mount
    // 时直接拿到新值——避免等 30s visibilitychange 节流
    onUserPrefsSync: ({ targetLang }) => {
      if (targetLang !== p.targetLang) {
        // patchUserPrefs 内部会 fail-soft 同时 PATCH /v1/me/settings —— 这里
        // 反向 sync 只走本地写入避免回写源头造成无限循环
        void chrome.storage.local.set({
          userPrefs: { ...p, targetLang, _v: 1 as const },
        });
      }
    },
    // content script 不能直接调 chrome.runtime.openOptionsPage()（API 不存在 in isolated world）
    // 走 sendMessage → background SW 代为打开
    onOpenSettings: () => {
      chrome.runtime.sendMessage({ type: 'open-options' });
    },
  });

  let handle = mount(buildOpts(prefs));
  let currentPrefs = prefs;

  onPrefsChanged((next) => {
    // 仅 triggerEnabled / uiLocale 变化时需要 unmount/remount —— 它们是 mount 的
    // 初始化参数。targetLang 单独变化**不要 unmount**：服务端 SSE meta.status 反向
    // 同步触发的 storage 写入会立即冒泡到这里；如果 unmount 会 abort 正在进行的
    // SSE 流，用户当下的改写直接挂掉。targetLang 是软状态（服务端 user_settings 是
    // 权威源，detectTargetLang 下次触发时本来就会重读 chrome.storage），stale 几秒
    // 没关系，比 abort 中流好得多。
    const triggerChanged = next.triggerEnabled !== currentPrefs.triggerEnabled;
    const uiLocaleChanged = next.uiLocale !== currentPrefs.uiLocale;
    currentPrefs = next;
    if (!triggerChanged && !uiLocaleChanged) return;

    handle.unmount();
    if (!next.triggerEnabled) return;
    handle = mount(buildOpts(next));
  });
}

bootstrap().catch((err) => {
  console.warn('[rewrite.so] content bootstrap failed', err);
});
