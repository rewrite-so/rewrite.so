import { PRO_PRICE, QUOTA } from '@rewrite/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pricing' });
  return { title: t('title'), description: t('description') };
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('page.pricing');

  return (
    <article>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>{t('h1')}</h1>
      <p style={{ color: '#555', marginTop: 12, fontSize: 16 }}>{t('intro')}</p>

      <div
        style={{
          marginTop: 36,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <PricingCard
          title={t('free.title')}
          price="$0"
          period={t('free.period')}
          features={[
            t('free.feat1', { count: QUOTA.loggedInFree }),
            t('free.feat2', { count: QUOTA.anonymousIp }),
            t('free.feat3', { count: QUOTA.anonymousInstall }),
            t('free.feat4'),
            t('free.feat5'),
            t('free.feat6'),
            t('free.feat7'),
          ]}
          cta={{ label: t('free.cta'), href: '/try' }}
        />

        <PricingCard
          title={t('pro.title')}
          highlight
          /* 主推年付：主价格显示 yearlyMonthly($7.99)，period 标"/ mo, billed annually"；
             月付选项作为 subPrice 一行小字。整个价格点的视觉重心倒过来了。 */
          price={`$${PRO_PRICE.yearlyMonthly}`}
          period={t('pro.period')}
          subPrice={t('pro.subPrice', {
            yearlyTotal: PRO_PRICE.yearlyTotal,
            monthly: PRO_PRICE.monthly,
            savings: PRO_PRICE.yearlySavingsPercent,
          })}
          features={[
            t('pro.feat1', { count: QUOTA.pro }),
            t('pro.feat2'),
            t('pro.feat3'),
            t('pro.feat4'),
          ]}
          cta={{ label: t('pro.cta'), href: '/billing' }}
        />
      </div>

      <h2 style={H2}>{t('faq.h2')}</h2>

      <Faq q={t('faq.q1')} a={t('faq.a1')} />
      <Faq
        q={t('faq.q2')}
        a={t.rich('faq.a2', {
          privacy: (chunks) => <a href="/privacy">{chunks}</a>,
        })}
      />
      <Faq q={t('faq.q3')} a={t('faq.a3')} />
      <Faq q={t('faq.q4')} a={t('faq.a4')} />
      <Faq
        q={t('faq.q5')}
        a={t.rich('faq.a5', {
          settings: (chunks) => <Link href="/settings">{chunks}</Link>,
          refund: (chunks) => <a href="/refund">{chunks}</a>,
        })}
      />
      <Faq
        q={t('faq.q6')}
        a={t.rich('faq.a6', {
          creem: (chunks) => (
            <a href="https://creem.io" target="_blank" rel="noopener noreferrer">
              {chunks}
            </a>
          ),
        })}
      />
    </article>
  );
}

function PricingCard({
  title,
  price,
  period,
  subPrice,
  features,
  cta,
  highlight,
}: {
  title: string;
  price: string;
  period: string;
  subPrice?: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: 24,
        border: highlight ? '2px solid #111' : '1px solid #e4e4e7',
        borderRadius: 12,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 700 }}>{price}</span>
        <span style={{ fontSize: 13, color: '#888' }}>{period}</span>
      </div>
      {subPrice && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{subPrice}</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0', flex: 1 }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 13, color: '#444', padding: '4px 0' }}>
            ✓ {f}
          </li>
        ))}
      </ul>
      <Link
        href={cta.href}
        style={{
          // boxSizing: border-box 让 width:100% + padding 不溢出卡片
          boxSizing: 'border-box',
          width: '100%',
          padding: '10px 14px',
          background: highlight ? '#111' : '#f4f4f5',
          color: highlight ? '#fff' : '#111',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          textDecoration: 'none',
          textAlign: 'center',
          display: 'block',
        }}
      >
        {cta.label}
      </Link>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{q}</h3>
      <p style={{ color: '#555', marginTop: 6 }}>{a}</p>
    </div>
  );
}

const H2 = {
  fontSize: 22,
  fontWeight: 600,
  marginTop: 56,
  marginBottom: 12,
};
