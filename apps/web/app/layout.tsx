import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'rewrite.so — 双击 Shift 即时改写',
  description: '输入框级 AI 改写引擎，3 种风格，键盘选择，不中断心流。',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
