import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SettingsClient } from './SettingsClient.tsx';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.settings' });
  return { title: t('title') };
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'page.settings' });
  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '64px 24px 48px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{t('h1')}</h1>
      <SettingsClient />
    </main>
  );
}
