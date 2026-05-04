import type { Metadata } from 'next';
import { routing } from '../i18n/routing.ts';

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://rewrite.so';
const APP_ICONS: Metadata['icons'] = {
  icon: [
    { url: '/favicon.svg', type: 'image/svg+xml' },
    { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
  ],
  apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
};

export function localePath(locale: string, path = '/'): string {
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`;
  const normalizedPath = path === '' ? '/' : path.startsWith('/') ? path : `/${path}`;
  if (normalizedPath === '/') return prefix || '/';
  return `${prefix}${normalizedPath}`;
}

export function localizedMetadata(
  locale: string,
  path: string,
  metadata: Omit<Metadata, 'alternates' | 'metadataBase'>,
): Metadata {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) {
    languages[l] = `${SITE_ORIGIN}${localePath(l, path)}`;
  }
  languages['x-default'] = `${SITE_ORIGIN}${localePath(routing.defaultLocale, path)}`;

  return {
    ...metadata,
    metadataBase: new URL(SITE_ORIGIN),
    alternates: {
      canonical: `${SITE_ORIGIN}${localePath(locale, path)}`,
      languages,
    },
    icons: metadata.icons ?? APP_ICONS,
  };
}
