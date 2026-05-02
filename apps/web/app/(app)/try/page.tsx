import { TryClient } from './TryClient.tsx';

export const metadata = {
  title: 'Try rewrite.so — Double-tap Shift to rewrite',
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
        <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Try it</h1>
        <p style={{ marginTop: 8, color: '#666', fontSize: 15 }}>
          Write something in the box below, then double-tap Shift to see 3 style rewrites.
        </p>
      </header>
      <TryClient />
    </main>
  );
}
