import { LoginClient } from './LoginClient.tsx';

export const metadata = {
  title: '登录 — rewrite.so',
};

export default function LoginPage() {
  return (
    <main
      style={{
        maxWidth: 420,
        margin: '120px auto 64px',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>登录</h1>
      <p style={{ marginTop: 8, color: '#666', fontSize: 14, lineHeight: 1.55 }}>
        填写邮箱，我们发一个登录链接给你。无需密码。
      </p>
      <LoginClient />
    </main>
  );
}
