import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BillingClient } from './BillingClient.tsx';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.billing' });
  return { title: t('title') };
}

export default function BillingPage() {
  return (
    <main
      style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '64px 24px 48px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Upgrade to Pro</h1>
      <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
        2,000 AI rewrites per month. 3 styles streamed in parallel. BYOK (Bring Your Own Key)
        unlocks unlimited usage.
      </p>
      <BillingClient />
    </main>
  );
}
