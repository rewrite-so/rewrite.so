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
    // suppressHydrationWarning 加在 <html> 和 <body>：常见浏览器扩展（1Password、
    // Grammarly、深色模式切换器、翻译插件）会在 SSR HTML 到达后向 <html>/<body>
    // 注入额外属性（data-* / class），导致 React 报 hydration mismatch。这里只
    // 抑制属性级别的警告，*不会*掩盖 React 树内部真实的 hydration bug——后者仍正常报。
    <html lang={locale} suppressHydrationWarning>
      <body
        suppressHydrationWarning
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
