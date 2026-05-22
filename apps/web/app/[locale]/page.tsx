import { PRO_PRICE, QUOTA } from '@rewrite/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ComparisonTableTracked } from '../../components/ComparisonTableTracked.tsx';
import { CtaLink } from '../../components/CtaLink.tsx';
import { EarlyBirdBadge } from '../../components/EarlyBirdBadge.tsx';
import { SectionViewMarker } from '../../components/SectionViewMarker.tsx';
import type {
  ComparisonCellValue,
  ComparisonColumn,
  ComparisonRow,
} from '../../components/ui/ComparisonTable.tsx';
import { getCampaignEntryState } from '../../lib/campaign-entry.ts';
import { getExtensionInstallUrl } from '../../lib/extension-install-url.ts';
import styles from './HomePage.module.css';
import { HomeRewriteDemo } from './HomeRewriteDemo.tsx';
import type { PlatformName } from './PlatformIcon.tsx';
import { PriceTeaser } from './PriceTeaser.tsx';
import { ScenariosShowcase } from './ScenariosShowcase.tsx';

const COMPARE_ROW_KEYS = [
  'inline',
  'multilang',
  'keyboard',
  'candidates',
  'speed',
  'logging',
  'byok',
  'openSource',
] as const;

type CompareKind = ComparisonCellValue['kind'];

const COMPARE_COL_KEYS = ['us', 'grammarly', 'deepl', 'chatgpt'] as const;

/**
 * Per-cell kind only. The user-facing label (and the 'text' kind's full
 * string) live in i18n at home.compare.rows.<row>.cells.<col> so every
 * locale renders consistently. Cells without an i18n entry just show the
 * icon — see compareRows builder below.
 *
 * Source for the kind matrix: each vendor's public product / pricing page,
 * captured 2026-05. Re-verify on every PR that touches this table.
 */
const COMPARE_KIND: Record<
  (typeof COMPARE_ROW_KEYS)[number],
  Record<(typeof COMPARE_COL_KEYS)[number], CompareKind>
> = {
  inline: { us: 'check', grammarly: 'partial', deepl: 'partial', chatgpt: 'cross' },
  // keyboard: every cell carries a gesture label so the whole row reads as text.
  keyboard: { us: 'text', grammarly: 'text', deepl: 'text', chatgpt: 'text' },
  speed: { us: 'text', grammarly: 'text', deepl: 'text', chatgpt: 'text' },
  candidates: { us: 'check', grammarly: 'cross', deepl: 'partial', chatgpt: 'cross' },
  logging: { us: 'check', grammarly: 'unknown', deepl: 'unknown', chatgpt: 'unknown' },
  byok: { us: 'check', grammarly: 'cross', deepl: 'cross', chatgpt: 'cross' },
  multilang: { us: 'check', grammarly: 'partial', deepl: 'partial', chatgpt: 'check' },
  openSource: { us: 'check', grammarly: 'cross', deepl: 'cross', chatgpt: 'cross' },
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
// 3 个使用场景。每个用例的演示会展示 3 候选(faithful/casual/formal)对比,所以
// 用例本身不再绑定单一 style —— 用例和 platform 一一对应。i18n key 用 semantic
// 命名(useCaseWork / useCaseLearn / useCasePublic)而非编号,避免历史包袱。
const USE_CASES: ReadonlyArray<{
  key: string;
  platform: PlatformName;
}> = [
  { key: 'useCaseWork', platform: 'GitHub' },
  { key: 'useCaseLearn', platform: 'Discord' },
  { key: 'useCasePublic', platform: 'X' },
];
// 顺序与 hero demo 的 STYLE_KEYS 保持一致(faithful → casual → formal),
// 三种风格按"贴近原文 → 口语 → 正式"的渐变排列。
const CANDIDATE_STYLES = ['faithful', 'casual', 'formal'] as const;

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

  const compareRows: ComparisonRow[] = COMPARE_ROW_KEYS.map((row) => {
    const cells: Record<string, ComparisonCellValue> = {};
    for (const col of COMPARE_COL_KEYS) {
      const kind = COMPARE_KIND[row][col];
      // i18n key for this cell's label. Some rows (logging / byok) have no
      // cells block at all — the icon alone is the cell.
      const cellKey = `compare.rows.${row}.cells.${col}` as const;
      const hasLabel = t.has(cellKey);
      if (kind === 'text') {
        cells[col] = { kind: 'text', text: hasLabel ? t(cellKey) : '' };
      } else if (hasLabel) {
        cells[col] = { kind, label: t(cellKey) };
      } else {
        cells[col] = { kind };
      }
    }
    return {
      key: row,
      label: t(`compare.rows.${row}.label`),
      detail: t(`compare.rows.${row}.detail`),
      cells,
    };
  });

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
            {/* Hero left side intentionally stays at 5 elements: h1 + sub +
                2 CTAs + fineprint. eyebrow / brand h1 / heroIntro / standalone
                GitHub link were removed in the PR-2-iter tightening — see plan. */}
            <h1 className={styles.heroStatement}>
              <span>{t('hero.h1Line1')}</span>
              <span>{t('hero.h1Line2')}</span>
            </h1>
            <p className={styles.heroLead}>{t('hero.subHeadline')}</p>
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
            <p className={styles.fineprint}>
              {t('hero.fineprint', { count: QUOTA.loggedInFree })}
              {' · '}
              <CtaLink
                cta="github"
                href="https://github.com/rewrite-so/rewrite.so"
                external
                className={styles.fineprintLink}
              >
                GitHub →
              </CtaLink>
            </p>
          </div>

          <HomeRewriteDemo copy={demoCopy} />
        </div>
      </section>

      <section className={styles.proofBand} aria-label={t('proofBand.ariaLabel')}>
        <ProofItem value={t('proofBand.item1Value')} label={t('proofBand.item1Label')} />
        <ProofItem value={t('proofBand.item2Value')} label={t('proofBand.item2Label')} />
        <ProofItem value={t('proofBand.item3Value')} label={t('proofBand.item3Label')} />
      </section>

      <SectionViewMarker section="how" />
      <section className={`${styles.section} ${styles.howSection}`}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{t('howItWorks.eyebrow')}</p>
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

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{t('scenarios.h2')}</p>
          <h2 className={styles.sectionTitle}>{t('scenarios.bridge')}</h2>
        </div>
        <ScenariosShowcase
          items={USE_CASES.map(({ key, platform }) => ({
            key,
            platform,
            title: t(`scenarios.${key}.title`),
            description: t(`scenarios.${key}.description`),
            input: t(`scenarios.${key}.input`),
            candidates: CANDIDATE_STYLES.map((style) => ({
              style,
              label: t(`demo.label.${style}`),
              text: t(`scenarios.${key}.candidates.${style}`),
            })),
          }))}
        />
        <p className={styles.scenariosLearnLink}>
          <CtaLink cta="learn_english" href="/learn-english" className={styles.scenariosLearnPill}>
            {t('scenarios.learnLink')}
          </CtaLink>
        </p>
      </section>

      <SectionViewMarker section="comparison" />
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>{t('compare.eyebrow')}</p>
          <h2 className={styles.sectionTitle}>{t('compare.h2')}</h2>
          <p className={styles.sectionSubtitle}>{t('compare.subtitle')}</p>
        </div>
        <ComparisonTableTracked
          caption={t('compare.caption')}
          columns={compareColumns}
          rows={compareRows}
          recommendedLabel={t('compare.recommended')}
          disclaimer={t('compare.disclaimer')}
        />
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
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{t('features.h2')}</h2>
        </div>
        <div className={styles.featureRow}>
          <Feature
            label={t('features.crossLang.label')}
            title={t('features.crossLang.title')}
            body={t('features.crossLang.body')}
          />
          <Feature
            label={t('features.keyboard.label')}
            title={t('features.keyboard.title')}
            body={t('features.keyboard.body')}
          />
          <Feature
            label={t('features.pii.label')}
            title={t('features.pii.title')}
            body={t('features.pii.body')}
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
            card="free"
            title={t('pricing.free.title')}
            price={t('pricing.free.price')}
            sub={t('pricing.free.sub', { count: QUOTA.loggedInFree })}
            features={[t('pricing.free.feat1'), t('pricing.free.feat2'), t('pricing.free.feat3')]}
          />
          <PriceTeaser
            card="pro"
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
          />
          <PriceTeaser
            card="byok"
            title={t('pricing.byok.title')}
            price={t('pricing.byok.price')}
            sub={t('pricing.byok.sub')}
            features={[t('pricing.byok.feat1'), t('pricing.byok.feat2'), t('pricing.byok.feat3')]}
          />
        </div>
        <div className={styles.pricingActions}>
          <CtaLink cta="pricing" href="/pricing" className={styles.secondaryButton}>
            {t('pricing.ctaSeeFull')}
          </CtaLink>
        </div>
      </section>

      <SectionViewMarker section="finalCta" />
      <section className={`${styles.section} ${styles.finalCta}`}>
        <h2 className={styles.sectionTitle}>{t('finalCta.h2')}</h2>
        <p className={styles.finalCtaBody}>{t('finalCta.body')}</p>
        <div className={styles.finalCtaActions}>
          <CtaLink
            cta="install"
            href={getExtensionInstallUrl()}
            external
            className={styles.primaryButton}
          >
            {t('finalCta.primary')}
          </CtaLink>
          <CtaLink cta="try_demo" href="/try" className={styles.secondaryButton}>
            {t('finalCta.secondary')}
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

function Kbd({ children, large }: { children: ReactNode; large?: boolean }) {
  return <kbd className={large ? `${styles.kbd} ${styles.kbdLarge}` : styles.kbd}>{children}</kbd>;
}
