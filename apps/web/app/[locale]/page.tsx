import { PRO_PRICE, QUOTA } from '@rewrite/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Link } from '../../i18n/navigation.ts';
import { getExtensionInstallUrl } from '../../lib/extension-install-url.ts';
import styles from './HomePage.module.css';
import { HomeRewriteDemo } from './HomeRewriteDemo.tsx';

const STYLE_KEYS = ['faithful', 'casual', 'formal'] as const;
const DEMO_EXAMPLE_KEYS = ['chinglish', 'zhToEn', 'jaToEn', 'tone'] as const;
const USE_CASE_KEYS = ['useCase1', 'useCase2', 'useCase3', 'useCase4'] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

  const demoCopy = {
    anyInput: t('demo.anyInput'),
    youTyped: t('demo.youTyped'),
    streams: t('demo.streams'),
    accepted: t('demo.accepted'),
    selectHint: t('demo.selectHint'),
    examples: DEMO_EXAMPLE_KEYS.map((example) => ({
      key: example,
      badge: t(`demo.examples.${example}.badge`),
      input: t(`demo.examples.${example}.input`),
      candidates: STYLE_KEYS.map((style) => ({
        style,
        label: t(`demo.label.${style}`),
        text: t(`demo.examples.${example}.candidate.${style}`),
      })),
    })),
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroImage} aria-hidden="true" />
        <div className={styles.heroWash} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
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
              <Link href="/try" className={styles.primaryButton}>
                {t('hero.ctaPrimary')}
              </Link>
              <a
                href={getExtensionInstallUrl()}
                className={styles.secondaryButton}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('hero.ctaInstall')}
              </a>
            </div>
            <p className={styles.fineprint}>{t('hero.fineprint', { count: QUOTA.loggedInFree })}</p>
            <a
              href="https://github.com/rewrite-so/rewrite.so"
              className={styles.heroGithubLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('hero.ctaGithub')}
            </a>
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
          <Link href="/pricing" className={styles.secondaryButton}>
            {t('pricing.ctaSeeFull')}
          </Link>
          <Link href="/try" className={styles.primaryButton}>
            {t('finalCta.primary')}
          </Link>
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
