import { useEffect, useState } from 'preact/hooks';
import { fetchMe, type MeResponse } from '../lib/me.ts';
import { getUserPrefs, patchUserPrefs, type UserPrefs } from '../lib/storage.ts';
import { LoggedInSettings } from './LoggedInSettings.tsx';
import { Onboarding } from './Onboarding.tsx';
import { Settings } from './Settings.tsx';

export function App() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  // null = 探测中；user!=null = 登录；user==null = 匿名
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    (async () => {
      const local = await getUserPrefs();
      setPrefs(local);
      const meResp = await fetchMe();
      setMe(meResp);
    })();
  }, []);

  if (!prefs || me === null) return null;

  // onboarding 是本地 UX flag，不论登录态都先走（首次安装即使已登录也需要简短引导）
  if (!prefs.hasCompletedOnboarding) {
    return (
      <Onboarding
        authed={me.user != null}
        onComplete={async (patch) => {
          const next = await patchUserPrefs({ ...patch, hasCompletedOnboarding: true });
          setPrefs(next);
        }}
      />
    );
  }

  if (me.user) {
    return (
      <LoggedInSettings
        prefs={prefs}
        userEmail={me.user.email}
        tier={me.tier ?? 'free'}
        onUpdate={async (patch) => {
          const next = await patchUserPrefs(patch);
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
