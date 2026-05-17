import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localizedMetadata } from '../../../metadata.ts';
import styles from './Login.module.css';
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
    <main className={styles.main}>
      <h1 className={styles.h1}>{t('h1')}</h1>
      <p className={styles.intro}>{t('intro')}</p>
      <LoginClient />
    </main>
  );
}
