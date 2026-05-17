import { PRO_PRICE, QUOTA } from '@rewrite/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getCampaignEntryState } from '../../../../lib/campaign-entry.ts';
import { localizedMetadata } from '../../../metadata.ts';
import styles from './Pricing.module.css';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.pricing' });
  return localizedMetadata(locale, '/pricing', {
    title: t('title'),
    description: t('description'),
  });
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('page.pricing');
  const earlyBird = await getCampaignEntryState('early-bird');

  return (
    <article>
      <h1 className={styles.h1}>{t('h1')}</h1>
      <p className={styles.intro}>{t('intro')}</p>

      {earlyBird.showBadge && (
        <div className={styles.banner}>
          <span className={styles.bannerLabel}>{t('earlyBird.label')}</span>
          <span className={styles.bannerPerks}>{t('earlyBird.perks')}</span>
          <Link href="/early-bird" className={styles.bannerCta}>
            {t('earlyBird.cta')}
          </Link>
        </div>
      )}

      <div className={styles.cards}>
        <PricingCard
          label={t('free.title')}
          price="$0"
          period={t('free.period')}
          features={[
            t('free.feat1', { count: QUOTA.loggedInFree }),
            t('free.feat2', { count: QUOTA.anonymousIp }),
            t('free.feat3', { count: QUOTA.anonymousInstall }),
            t('free.feat4'),
            t('free.feat5'),
            t('free.feat6'),
          ]}
          cta={{ label: t('free.cta'), href: '/try', variant: 'secondary' }}
        />

        <PricingCard
          label={t('pro.title')}
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
          cta={{ label: t('pro.cta'), href: '/billing', variant: 'primary' }}
        />

        <PricingCard
          label={t('byok.title')}
          byok
          price={t('byok.price')}
          period={t('byok.period')}
          tagline={t('byok.tagline')}
          features={[t('byok.feat1'), t('byok.feat2'), t('byok.feat3'), t('byok.feat4')]}
          cta={{ label: t('byok.cta'), href: '/settings#byok', variant: 'byok' }}
        />
      </div>

      <h2 className={styles.faqH2}>{t('faq.h2')}</h2>

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

type CtaVariant = 'primary' | 'secondary' | 'byok';

function PricingCard({
  label,
  price,
  period,
  subPrice,
  tagline,
  features,
  cta,
  highlight,
  byok,
}: {
  label: string;
  price: string;
  period: string;
  subPrice?: string;
  tagline?: string;
  features: string[];
  cta: { label: string; href: string; variant: CtaVariant };
  highlight?: boolean;
  byok?: boolean;
}) {
  const cardCls = [styles.card, highlight && styles.cardHighlight, byok && styles.cardByok]
    .filter(Boolean)
    .join(' ');
  const ctaCls = [
    styles.cta,
    cta.variant === 'primary' && styles.ctaPrimary,
    cta.variant === 'secondary' && styles.ctaSecondary,
    cta.variant === 'byok' && styles.ctaByok,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cardCls}>
      <div className={styles.cardLabel}>{label}</div>
      <div className={styles.priceRow}>
        <span className={styles.price}>{price}</span>
        <span className={styles.period}>{period}</span>
      </div>
      {subPrice && <div className={styles.subPrice}>{subPrice}</div>}
      {tagline && <p className={styles.tagline}>{tagline}</p>}
      <ul className={styles.featuresList}>
        {features.map((f) => (
          <li key={f} className={styles.featureItem}>
            {f}
          </li>
        ))}
      </ul>
      <Link href={cta.href} className={ctaCls}>
        {cta.label}
      </Link>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: ReactNode }) {
  return (
    <div className={styles.faqItem}>
      <h3 className={styles.faqQ}>{q}</h3>
      <p className={styles.faqA}>{a}</p>
    </div>
  );
}
