import { TryClient } from './TryClient.tsx';

export const metadata = {
  title: 'Try rewrite.so — 双击 Shift 即时改写',
};

export default function TryPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px 48px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        lineHeight: 1.55,
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>试试看</h1>
        <p style={{ marginTop: 8, color: '#666', fontSize: 15 }}>
          在下面的输入框写点东西，按两次 Shift（双击 Shift），看看 3 种风格的改写。
        </p>
      </header>
      <TryClient />
    </main>
  );
}
