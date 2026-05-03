import { useEffect, useState } from 'preact/hooks';
import { fetchCloudPrefs, getUserPrefs, patchUserPrefs, type UserPrefs } from '../lib/storage.ts';
import { Onboarding } from './Onboarding.tsx';
import { Settings } from './Settings.tsx';

export function App() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);

  useEffect(() => {
    // 启动时尝试从 web 同步偏好（如登录），失败 fallback 到 local
    (async () => {
      const local = await getUserPrefs();
      const cloud = await fetchCloudPrefs();
      if (cloud && (cloud.targetLang !== local.targetLang || cloud.uiLocale !== local.uiLocale)) {
        // 用 patchUserPrefs 让 chrome.storage 持久化（同时它会再 PATCH 回 cloud——是 noop）
        const merged = await patchUserPrefs(cloud);
        setPrefs(merged);
      } else {
        setPrefs(local);
      }
    })();
  }, []);

  if (!prefs) return null;

  if (!prefs.hasCompletedOnboarding) {
    return (
      <Onboarding
        onComplete={async (patch) => {
          const next = await patchUserPrefs({ ...patch, hasCompletedOnboarding: true });
          setPrefs(next);
        }}
      />
    );
  }

  return (
    <Settings
      prefs={prefs}
      onUpdate={async (patch) => {
        const next = await patchUserPrefs(patch);
        setPrefs(next);
      }}
    />
  );
}
