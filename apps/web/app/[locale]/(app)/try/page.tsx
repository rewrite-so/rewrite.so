import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localizedMetadata } from '../../../metadata.ts';
import styles from './Try.module.css';
import { TryClient } from './TryClient.tsx';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.try' });
  return localizedMetadata(locale, '/try', { title: t('title') });
}

export default async function TryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('page.try');
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.h1}>{t('h1')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>
      <TryClient />
    </main>
  );
}
