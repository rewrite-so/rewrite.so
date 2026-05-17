import { PRO_PRICE, QUOTA } from '@rewrite/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { CtaLink } from '../../components/CtaLink.tsx';
import { EarlyBirdBadge } from '../../components/EarlyBirdBadge.tsx';
import { SectionViewMarker } from '../../components/SectionViewMarker.tsx';
import {
  type ComparisonCellValue,
  type ComparisonColumn,
  type ComparisonRow,
  ComparisonTable,
} from '../../components/ui/ComparisonTable.tsx';
import { getCampaignEntryState } from '../../lib/campaign-entry.ts';
import { getExtensionInstallUrl } from '../../lib/extension-install-url.ts';
import styles from './HomePage.module.css';
import { HomeRewriteDemo } from './HomeRewriteDemo.tsx';
import type { PlatformName } from './PlatformIcon.tsx';

const COMPARE_ROW_KEYS = [
  'inline',
  'speed',
  'candidates',
  'logging',
  'byok',
  'multilang',
  'openSource',
] as const;

/**
 * Comparison-table cells live here (not in i18n) because each cell mirrors
 * a public, verifiable fact about a competitor — translating "check / cross
 * / partial" doesn't add information, and freezing the fact set in code
 * makes the audit trail tighter when we re-verify the table date.
 *
 * Re-verify on every PR that touches this table. Source: each vendor's
 * public product page / pricing page, captured 2026-05.
 */
const COMPARE_CELLS: Record<
  (typeof COMPARE_ROW_KEYS)[number],
  Record<string, ComparisonCellValue>
> = {
  inline: {
    us: { kind: 'check' },
    grammarly: { kind: 'partial', label: 'Sidebar suggestions' },
    deepl: { kind: 'partial', label: 'Extension on supported sites' },
    chatgpt: { kind: 'cross', label: 'Copy / paste' },
  },
  speed: {
    us: { kind: 'text', text: '~500 ms first token' },
    grammarly: { kind: 'text', text: 'Suggestion popovers' },
    deepl: { kind: 'text', text: 'Batch response' },
    chatgpt: { kind: 'text', text: 'Streaming, multi-second start' },
  },
  candidates: {
    us: { kind: 'check', label: '3 in parallel' },
    grammarly: { kind: 'cross', label: 'Single suggestion' },
    deepl: { kind: 'partial', label: 'Alternative tones' },
    chatgpt: { kind: 'cross', label: 'Single response' },
  },
  logging: {
    us: { kind: 'check' },
    grammarly: { kind: 'cross' },
    deepl: { kind: 'cross' },
    chatgpt: { kind: 'cross' },
  },
  byok: {
    us: { kind: 'check' },
    grammarly: { kind: 'cross' },
    deepl: { kind: 'cross' },
    chatgpt: { kind: 'cross' },
  },
  multilang: {
    us: { kind: 'check' },
    grammarly: { kind: 'partial', label: 'EN-focused' },
    deepl: { kind: 'partial', label: 'EU langs strong' },
    chatgpt: { kind: 'check' },
  },
  openSource: {
    us: { kind: 'check', label: 'Apache-2.0' },
    grammarly: { kind: 'cross' },
    deepl: { kind: 'cross' },
    chatgpt: { kind: 'cross' },
  },
};

const STYLE_KEYS = ['faithful', 'casual', 'formal'] as const;
// 每个 example 关联一个真实平台,demo chrome bar 显示对应 logo + 平台名,
// 暗示扩展在这些平台都工作。新加 platform 时确认扩展实际支持(参考 CLAUDE.md 不支持清单)。
const DEMO_EXAMPLES: ReadonlyArray<{ key: string; platform: PlatformName }> = [
  { key: 'chinglish', platform: 'X' },
  { key: 'zhToEn', platform: 'Slack' },
  { key: 'jaToEn', platform: 'Reddit' },
  { key: 'tone', platform: 'GitHub' },
];
const USE_CASE_KEYS = ['useCase1', 'useCase2', 'useCase3', 'useCase4'] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const earlyBirdEntry = await getCampaignEntryState('early-bird');

  const compareColumns: ComparisonColumn[] = [
    { key: 'us', name: t('compare.col.us'), isUs: true },
    { key: 'grammarly', name: t('compare.col.grammarly') },
    { key: 'deepl', name: t('compare.col.deepl') },
    { key: 'chatgpt', name: t('compare.col.chatgpt') },
  ];

  const compareRows: ComparisonRow[] = COMPARE_ROW_KEYS.map((key) => ({
    key,
    label: t(`compare.rows.${key}.label`),
    detail: t(`compare.rows.${key}.detail`),
    cells: COMPARE_CELLS[key],
  }));

  const demoCopy = {
    anyInput: t('demo.anyInput'),
    youTyped: t('demo.youTyped'),
    streams: t('demo.streams'),
    accepted: t('demo.accepted'),
    selectHint: t('demo.selectHint'),
    examples: DEMO_EXAMPLES.map(({ key, platform }) => ({
      key,
      platform,
      badge: t(`demo.examples.${key}.badge`),
      input: t(`demo.examples.${key}.input`),
      candidates: STYLE_KEYS.map((style) => ({
        style,
        label: t(`demo.label.${style}`),
        text: t(`demo.examples.${key}.candidate.${style}`),
      })),
    })),
  };

  return (
    <main className={styles.page}>
      <SectionViewMarker section="hero" />
      <section className={styles.hero}>
        <div className={styles.heroImage} aria-hidden="true" />
        <div className={styles.heroWash} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            {earlyBirdEntry.showBadge && <EarlyBirdBadge />}
            <p className={styles.eyebrow}>{t('hero.eyebrow')}</p>
            <h1 className={styles.heroTitle}>rewrite.so</h1>
            <p className={styles.heroStatement}>
              <span>{t('hero.h1Line1')}</span>
              <span>{t('hero.h1Line2')}</span>
            </p>
            <p className={styles.heroLead}>{t('hero.subHeadline')}</p>
            <p className={styles.heroIntro}>
              {t.rich('hero.intro', {
                kbd: (chunks) => <Kbd>{chunks}</Kbd>,
              })}
            </p>
            <div className={styles.heroActions}>
              <CtaLink
                cta="install"
                href={getExtensionInstallUrl()}
                external
                className={styles.primaryButton}
              >
                {t('hero.ctaPrimary')}
              </CtaLink>
              <CtaLink cta="try_demo" href="/try" className={styles.secondaryButton}>
                {t('hero.ctaInstall')}
              </CtaLink>
            </div>
            <p className={styles.fineprint}>{t('hero.fineprint', { count: QUOTA.loggedInFree })}</p>
            <CtaLink
              cta="github"
              href="https://github.com/rewrite-so/rewrite.so"
              external
              className={styles.heroGithubLink}
            >
              {t('hero.ctaGithub')}
            </CtaLink>
          </div>

          <HomeRewriteDemo copy={demoCopy} />
        </div>
      </section>

      <section className={styles.proofBand} aria-label={t('howItWorks.h2')}>
        <ProofItem value="3" label={t('howItWorks.step2.title')} />
        <ProofItem value="500ms" label={t('howItWorks.step1.title')} />
        <ProofItem value="0" label={t('privacy.h2')} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{t('scenarios.h2')}</p>
          <h2 className={styles.sectionTitle}>{t('scenarios.bridge')}</h2>
        </div>
        <div className={styles.useCaseGrid}>
          {USE_CASE_KEYS.map((key) => (
            <article className={styles.useCase} key={key}>
              <span className={styles.useCaseMark}>0{USE_CASE_KEYS.indexOf(key) + 1}</span>
              <p>{t(`scenarios.${key}`)}</p>
            </article>
          ))}
        </div>
      </section>

      <SectionViewMarker section="comparison" />
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{t('compare.eyebrow')}</p>
          <h2 className={styles.sectionTitle}>{t('compare.h2')}</h2>
          <p className={styles.sectionSubtitle}>{t('compare.subtitle')}</p>
        </div>
        <ComparisonTable
          caption={t('compare.caption')}
          columns={compareColumns}
          rows={compareRows}
          recommendedLabel={t('compare.recommended')}
          whyMattersLabel={t('compare.whyMatters')}
          disclaimer={t('compare.disclaimer')}
        />
      </section>

      <SectionViewMarker section="how" />
      <section className={`${styles.section} ${styles.howSection}`}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('howItWorks.h2')}</h2>
        </div>
        <div className={styles.stepGrid}>
          <Step
            stepLabel={t('howItWorks.stepLabel', { num: '1' })}
            visual={
              <span className={styles.keyPair}>
                <Kbd large>Shift</Kbd>
                <Kbd large>Shift</Kbd>
              </span>
            }
            title={t('howItWorks.step1.title')}
            body={t.rich('howItWorks.step1.body', {
              kbd: (chunks) => <Kbd>{chunks}</Kbd>,
            })}
          />
          <Step
            stepLabel={t('howItWorks.stepLabel', { num: '2' })}
            visual={<span className={styles.streamPill}>{t('howItWorks.step2.title')}</span>}
            title={t('howItWorks.step2.title')}
            body={t.rich('howItWorks.step2.body')}
          />
          <Step
            stepLabel={t('howItWorks.stepLabel', { num: '3' })}
            visual={
              <span className={styles.keyPair}>
                <Kbd large>1</Kbd>
                <Kbd large>2</Kbd>
                <Kbd large>3</Kbd>
              </span>
            }
            title={t('howItWorks.step3.title')}
            body={t.rich('howItWorks.step3.body')}
          />
        </div>
      </section>

      <SectionViewMarker section="privacy" />
      <section className={styles.privacyBand}>
        <div className={styles.privacyCopy}>
          <p className={styles.privacyEyebrow}>{t('privacy.eyebrow')}</p>
          <h2 className={styles.privacyTitle}>{t('privacy.h2')}</h2>
          <p className={styles.privacyBody}>{t('privacy.shortBody')}</p>
          <div className={styles.privacyLinks}>
            <a
              href="https://github.com/rewrite-so/rewrite.so/blob/main/docs/privacy.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('privacy.linkDoc')}
            </a>
            <a
              href="https://github.com/rewrite-so/rewrite.so/blob/main/apps/api/src/routes/rewrite.ts"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('privacy.linkSource')}
            </a>
          </div>
        </div>
        <div className={styles.logPanel} aria-hidden="true">
          <div className={styles.logGroup}>
            <span>{t('privacy.logTitle')}</span>
            <code>length=187</code>
            <code>lang=en</code>
            <code>style=faithful</code>
            <code>status=200</code>
          </div>
          <div className={styles.logGroup}>
            <span>{t('privacy.notLoggedTitle')}</span>
            <code className={styles.redacted}>{t('privacy.redacted.input')}</code>
            <code className={styles.redacted}>{t('privacy.redacted.rewrites')}</code>
            <code className={styles.redacted}>{t('privacy.redacted.rawIp')}</code>
            <code className={styles.redacted}>{t('privacy.redacted.apiKey')}</code>
          </div>
        </div>
      </section>

      <SectionViewMarker section="features" />
      <section className={styles.section}>
        <div className={styles.featureRow}>
          <Feature
            label={t('features.keyboard.label')}
            title={t('features.keyboard.title')}
            body={t('features.keyboard.body')}
          />
          <Feature
            label={t('features.crossLang.label')}
            title={t('features.crossLang.title')}
            body={t('features.crossLang.body')}
          />
          <Feature
            label={t('features.byok.label')}
            title={t('features.byok.title')}
            body={t('features.byok.body')}
          />
          <Feature
            label={t('features.openSource.label')}
            title={t('features.openSource.title')}
            body={t.rich('features.openSource.body', {
              repo: (chunks) => (
                <a
                  href="https://github.com/rewrite-so/rewrite.so"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
          />
        </div>
      </section>

      <SectionViewMarker section="pricing" />
      <section className={`${styles.section} ${styles.pricingSection}`}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('pricing.h2')}</h2>
        </div>
        <div className={styles.priceGrid}>
          <PriceTeaser
            title={t('pricing.free.title')}
            price={t('pricing.free.price')}
            sub={t('pricing.free.sub', { count: QUOTA.loggedInFree })}
            features={[t('pricing.free.feat1'), t('pricing.free.feat2'), t('pricing.free.feat3')]}
          />
          <PriceTeaser
            title={t('pricing.pro.title')}
            price={t('pricing.pro.price', { monthly: PRO_PRICE.yearlyMonthly })}
            sub={t('pricing.pro.sub', {
              total: PRO_PRICE.yearlyTotal,
              percent: PRO_PRICE.yearlySavingsPercent,
              monthlyAlt: PRO_PRICE.monthly,
            })}
            features={[
              t('pricing.pro.feat1', { count: QUOTA.pro }),
              t('pricing.pro.feat2'),
              t('pricing.pro.feat3'),
            ]}
            highlight
          />
        </div>
        <div className={styles.pricingActions}>
          <CtaLink cta="pricing" href="/pricing" className={styles.secondaryButton}>
            {t('pricing.ctaSeeFull')}
          </CtaLink>
          <CtaLink cta="try_demo" href="/try" className={styles.primaryButton}>
            {t('finalCta.primary')}
          </CtaLink>
        </div>
      </section>
    </main>
  );
}

function ProofItem({ value, label }: { value: string; label: string }) {
  return (
    <div className={styles.proofItem}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Step({
  stepLabel,
  visual,
  title,
  body,
}: {
  stepLabel: string;
  visual: ReactNode;
  title: string;
  body: ReactNode;
}) {
  return (
    <article className={styles.stepCard}>
      <div className={styles.stepLabel}>{stepLabel}</div>
      <div className={styles.stepVisual}>{visual}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function Feature({ label, title, body }: { label: string; title: string; body: ReactNode }) {
  return (
    <article className={styles.featureItem}>
      <span>{label}</span>
      <h3>{title}</h3>
      <p>{body}</p>
    </article>
  );
}

function PriceTeaser({
  title,
  price,
  sub,
  features,
  highlight,
}: {
  title: string;
  price: string;
  sub: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <article
      className={highlight ? `${styles.priceCard} ${styles.priceCardHighlight}` : styles.priceCard}
    >
      <div className={styles.priceName}>{title}</div>
      <div className={styles.priceValue}>{price}</div>
      <p>{sub}</p>
      <ul>
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
    </article>
  );
}

function Kbd({ children, large }: { children: ReactNode; large?: boolean }) {
  return <kbd className={large ? `${styles.kbd} ${styles.kbdLarge}` : styles.kbd}>{children}</kbd>;
}
