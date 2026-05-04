import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { localizedMetadata } from '../../../metadata.ts';
import { BillingClient } from './BillingClient.tsx';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.billing' });
  return localizedMetadata(locale, '/billing', { title: t('title') });
}

export default async function BillingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'page.billing' });
  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '64px 24px 48px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{t('h1')}</h1>
      <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>{t('intro')}</p>
      <BillingClient />
    </main>
  );
}
