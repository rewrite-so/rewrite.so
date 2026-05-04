import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localizedMetadata } from '../../../metadata.ts';
import { LoginClient } from './LoginClient.tsx';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.login' });
  return localizedMetadata(locale, '/login', { title: t('title') });
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('page.login');
  return (
    <main
      style={{
        maxWidth: 420,
        margin: '120px auto 64px',
        padding: '0 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{t('h1')}</h1>
      <p style={{ marginTop: 8, color: '#666', fontSize: 14, lineHeight: 1.55 }}>{t('intro')}</p>
      <LoginClient />
    </main>
  );
}
