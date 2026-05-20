import { QUOTA } from '@rewrite/shared';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CtaLink } from '../../../components/CtaLink.tsx';
import { SectionViewMarker } from '../../../components/SectionViewMarker.tsx';
import { Badge } from '../../../components/ui/Badge.tsx';
import { Card } from '../../../components/ui/Card.tsx';
import { getExtensionInstallUrl } from '../../../lib/extension-install-url.ts';
import { localizedMetadata } from '../../metadata.ts';
import homeStyles from '../HomePage.module.css';
import { HomeRewriteDemo } from '../HomeRewriteDemo.tsx';
import type { PlatformName } from '../PlatformIcon.tsx';
import { ScenariosShowcase } from '../ScenariosShowcase.tsx';
import styles from './LearnEnglish.module.css';

// Focused landing page for the English-learning angle. Deliberately NOT a
// second homepage: it carries only the sections unique to the learning
// narrative (contrast / why / routine) and links out to the homepage and
// /pricing for everything else. How-it-works is dropped — the hero demo
// already animates the double-Shift mechanic.

const STYLE_KEYS = ['faithful', 'casual', 'formal'] as const;

// Hero demo — learner-framed examples (imperfect English → three native
// versions) under `page.learn.demo`. Chrome strings still reuse `home.demo.*`.
const DEMO_EXAMPLES: ReadonlyArray<{ key: string; platform: PlatformName }> = [
  { key: 'wordChoice', platform: 'X' },
  { key: 'grammar', platform: 'Slack' },
  { key: 'phrasing', platform: 'Reddit' },
  { key: 'tone', platform: 'GitHub' },
];

// Scenario carousel — learner-framed. `platform` must be a PlatformName with a
// skin (X / Slack / Reddit / GitHub / Discord); there is no email skin, so the
// "writing emails" idea is carried by the Slack "messaging coworkers" card.
const SCENARIOS: ReadonlyArray<{ key: string; platform: PlatformName }> = [
  { key: 'useCaseChat', platform: 'Discord' },
  { key: 'useCasePosting', platform: 'Reddit' },
  { key: 'useCaseWork', platform: 'Slack' },
];

const WHY_POINTS = ['point1', 'point2', 'point3'] as const;
const ROUTINE_ITEMS = ['item1', 'item2', 'item3', 'item4'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.learn' });
  return localizedMetadata(locale, '/learn-english', {
    title: t('title'),
    description: t('description'),
  });
}

export default async function LearnEnglishPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('page.learn');
  const tHome = await getTranslations('home');

  const demoCopy = {
    anyInput: tHome('demo.anyInput'),
    youTyped: tHome('demo.youTyped'),
    streams: tHome('demo.streams'),
    accepted: tHome('demo.accepted'),
    selectHint: tHome('demo.selectHint'),
    examples: DEMO_EXAMPLES.map(({ key, platform }) => ({
      key,
      platform,
      badge: t(`demo.examples.${key}.badge`),
      input: t(`demo.examples.${key}.input`),
      candidates: STYLE_KEYS.map((style) => ({
        style,
        label: tHome(`demo.label.${style}`),
        text: t(`demo.examples.${key}.candidate.${style}`),
      })),
    })),
  };

  return (
    <main className={homeStyles.page}>
      <SectionViewMarker section="hero" />
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>
              <span>{t('hero.h1Line1')}</span>
              <span>{t('hero.h1Line2')}</span>
            </h1>
            <p className={styles.heroLead}>{t('hero.subHeadline')}</p>
            <div className={styles.heroActions}>
              <CtaLink
                cta="install"
                href={getExtensionInstallUrl()}
                external
                className={homeStyles.primaryButton}
              >
                {t('hero.ctaPrimary')}
              </CtaLink>
              <CtaLink cta="try_demo" href="/try" className={homeStyles.secondaryButton}>
                {t('hero.ctaSecondary')}
              </CtaLink>
            </div>
            <p className={styles.heroFineprint}>
              {t('hero.fineprint', { count: QUOTA.loggedInFree })}
            </p>
          </div>
          <div className={styles.heroDemo}>
            <HomeRewriteDemo copy={demoCopy} />
          </div>
        </div>
      </section>

      {/* One sentence. Three native ways to say it. */}
      <section className={homeStyles.section}>
        <div className={homeStyles.sectionHeader}>
          <h2 className={homeStyles.sectionTitle}>{t('contrast.h2')}</h2>
          <p className={homeStyles.sectionSubtitle}>{t('contrast.intro')}</p>
        </div>
        <div className={styles.contrastInput}>
          <span className={styles.contrastInputLabel}>{t('contrast.youWrote')}</span>
          <span className={styles.contrastInputText}>{t('contrast.input')}</span>
        </div>
        <div className={styles.contrastGrid}>
          {STYLE_KEYS.map((style) => (
            <Card key={style} as="article" padding="lg" className={styles.contrastCard}>
              <Badge variant="accent">{t(`contrast.${style}.label`)}</Badge>
              <p className={styles.contrastText}>{t(`contrast.${style}.text`)}</p>
              <p className={styles.contrastNote}>{t(`contrast.${style}.note`)}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* You learn by using the language. */}
      <section className={homeStyles.section}>
        <div className={homeStyles.sectionHeader}>
          <h2 className={homeStyles.sectionTitle}>{t('why.h2')}</h2>
        </div>
        <div className={homeStyles.stepGrid}>
          {WHY_POINTS.map((point, i) => (
            <PointCard
              key={point}
              index={`0${i + 1}`}
              title={t(`why.${point}.title`)}
              body={t(`why.${point}.body`)}
            />
          ))}
        </div>
      </section>

      {/* You write English every day. */}
      <section className={homeStyles.section}>
        <div className={homeStyles.sectionHeader}>
          <p className={homeStyles.eyebrow}>{t('scenarios.h2')}</p>
          <h2 className={homeStyles.sectionTitle}>{t('scenarios.bridge')}</h2>
        </div>
        <ScenariosShowcase
          items={SCENARIOS.map(({ key, platform }) => ({
            key,
            platform,
            title: t(`scenarios.${key}.title`),
            description: t(`scenarios.${key}.description`),
            input: t(`scenarios.${key}.input`),
            candidates: STYLE_KEYS.map((style) => ({
              style,
              label: tHome(`demo.label.${style}`),
              text: t(`scenarios.${key}.candidates.${style}`),
            })),
          }))}
        />
      </section>

      {/* A routine you can keep. */}
      <section className={homeStyles.section}>
        <div className={homeStyles.sectionHeader}>
          <h2 className={homeStyles.sectionTitle}>{t('routine.h2')}</h2>
          <p className={homeStyles.sectionSubtitle}>{t('routine.intro')}</p>
        </div>
        <div className={homeStyles.featureRow}>
          {ROUTINE_ITEMS.map((item, i) => (
            <PointCard
              key={item}
              index={`0${i + 1}`}
              title={t(`routine.${item}.title`)}
              body={t(`routine.${item}.body`)}
            />
          ))}
        </div>
      </section>

      {/* Start writing English today. */}
      <section className={styles.ctaBand}>
        <h2 className={styles.ctaBandTitle}>{t('finalCta.h2')}</h2>
        <p className={styles.ctaBandBody}>{t('finalCta.body')}</p>
        <div className={styles.ctaBandActions}>
          <CtaLink
            cta="install"
            href={getExtensionInstallUrl()}
            external
            className={homeStyles.primaryButton}
          >
            {t('finalCta.primary')}
          </CtaLink>
          <CtaLink cta="try_demo" href="/try" className={homeStyles.secondaryButton}>
            {t('finalCta.secondary')}
          </CtaLink>
        </div>
        <p className={styles.ctaBandNote}>
          {t('pricing.body', { count: QUOTA.loggedInFree })}{' '}
          <CtaLink cta="pricing" href="/pricing" className={styles.ctaBandNoteLink}>
            {t('pricing.cta')}
          </CtaLink>
        </p>
      </section>
    </main>
  );
}

// Used by both the "why" (3) and "routine" (4) sections — same card, different
// grid wrapper (homeStyles.stepGrid vs homeStyles.featureRow).
function PointCard({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <article className={styles.pointCard}>
      <span className={styles.pointIndex}>{index}</span>
      <h3 className={styles.pointTitle}>{title}</h3>
      <p className={styles.pointBody}>{body}</p>
    </article>
  );
}
