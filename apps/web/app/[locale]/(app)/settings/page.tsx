import { SettingsClient } from './SettingsClient.tsx';

export const metadata = {
  title: 'Settings — rewrite.so',
};

export default function SettingsPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px 48px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Settings</h1>
      <SettingsClient />
    </main>
  );
}
