import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { localizedMetadata } from '../../../metadata.ts';
import EarlyBirdClient from './EarlyBirdClient.tsx';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'page.early-bird' });
  return localizedMetadata(locale, '/early-bird', {
    title: t('title'),
    description: t('subtitle'),
  });
}

export default async function EarlyBirdPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <EarlyBirdClient locale={locale} />;
}
