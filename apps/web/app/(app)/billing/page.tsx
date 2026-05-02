import { BillingClient } from './BillingClient.tsx';

export const metadata = {
  title: '订阅 — rewrite.so',
};

export default function BillingPage() {
  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '64px 24px 48px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>升级 Pro</h1>
      <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
        2,000 次 AI 改写 / 月，3 种风格并发流式生成，支持自带 API Key（BYOK）解锁无限改写。
      </p>
      <BillingClient />
    </main>
  );
}
