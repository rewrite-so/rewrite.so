import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Footer } from '../../components/Footer.tsx';
import { TopNav } from '../../components/TopNav.tsx';
import { routing } from '../../i18n/routing.ts';

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://rewrite.so';

function localePath(locale: string): string {
  return locale === routing.defaultLocale ? '' : `/${locale}`;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  const t = await getTranslations({ locale, namespace: 'meta.home' });

  // 输出 7 个 hreflang + x-default 给 Google / Bing 关联多语言版本
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_ORIGIN}${localePath(l)}/`;
  }
  languages['x-default'] = `${SITE_ORIGIN}/`;

  return {
    title: t('title'),
    description: t('description'),
    metadataBase: new URL(SITE_ORIGIN),
    alternates: {
      canonical: `${SITE_ORIGIN}${localePath(locale)}/`,
      languages,
    },
  };
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
