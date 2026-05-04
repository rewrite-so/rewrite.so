import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localizedMetadata } from '../../metadata.ts';
import { UnsubscribeClient } from './UnsubscribeClient.tsx';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.unsubscribe' });
  return localizedMetadata(locale, '/unsubscribe', { title: t('title') });
}

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ user?: string; token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('page.unsubscribe');
  return (
    <main
      style={{
        maxWidth: 520,
        margin: '120px auto 64px',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{t('h1')}</h1>
      <UnsubscribeClient searchParams={searchParams} />
      <p style={{ marginTop: 32, color: '#888', fontSize: 12, lineHeight: 1.6 }}>{t('footnote')}</p>
    </main>
  );
}
