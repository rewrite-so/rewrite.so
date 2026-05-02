import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Footer } from '../components/Footer.tsx';

export const metadata: Metadata = {
  title: 'rewrite.so — Double-tap Shift to rewrite',
  description:
    'Input-box-level AI rewrite engine. 3 styles, keyboard-only, never breaks your flow.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ flex: 1 }}>{children}</div>
        <Footer />
      </body>
    </html>
  );
}
