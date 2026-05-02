import type { MetadataRoute } from 'next';

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://rewrite.so';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/v1/', '/settings', '/billing', '/unsubscribe'],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
