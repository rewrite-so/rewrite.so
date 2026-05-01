import { useEffect, useState } from 'preact/hooks';
import { getUserPrefs, patchUserPrefs, type UserPrefs } from '../lib/storage.ts';
import { Onboarding } from './Onboarding.tsx';
import { Settings } from './Settings.tsx';

export function App() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);

  useEffect(() => {
    getUserPrefs().then(setPrefs);
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
