import type { ReactNode } from 'react';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px 48px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        lineHeight: 1.7,
        color: '#222',
        fontSize: 15,
      }}
    >
      {children}
    </main>
  );
}
