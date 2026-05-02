import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Footer } from '../../components/Footer.tsx';
import { TopNav } from '../../components/TopNav.tsx';
import { routing } from '../../i18n/routing.ts';

export const metadata: Metadata = {
  title: 'rewrite.so — Double-tap Shift to rewrite',
  description:
    'Input-box-level AI rewrite engine. 3 styles, keyboard-only, never breaks your flow.',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <NextIntlClientProvider messages={messages}>
          <TopNav />
          <div style={{ flex: 1 }}>{children}</div>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
