import { UnsubscribeClient } from './UnsubscribeClient.tsx';

export const metadata = {
  title: 'Unsubscribe — rewrite.so',
};

export default function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; token?: string }>;
}) {
  return (
    <main
      style={{
        maxWidth: 520,
        margin: '120px auto 64px',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Unsubscribe</h1>
      <UnsubscribeClient searchParams={searchParams} />
      <p style={{ marginTop: 32, color: '#888', fontSize: 12, lineHeight: 1.6 }}>
        Note: this only stops onboarding emails. Transactional emails — login links, billing
        receipts, security alerts — keep working as required by law.
      </p>
    </main>
  );
}
