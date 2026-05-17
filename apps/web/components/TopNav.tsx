import { getTranslations } from 'next-intl/server';
import { Link } from '../i18n/navigation.ts';
import { getCampaignEntryState } from '../lib/campaign-entry.ts';
import { getExtensionInstallUrl } from '../lib/extension-install-url.ts';
import { getCurrentUser } from '../lib/get-current-user.ts';
import { CtaLink } from './CtaLink.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import styles from './TopNav.module.css';

// Early Bird link visibility flows through the shared
// `getCampaignEntryState('early-bird')` helper (apps/web/lib/campaign-entry.ts),
// which also drives the homepage Hero badge. The two surfaces are locked
// together via the `show_homepage_badge` column on the campaigns row — so
// `state.showBadge` is the single condition for showing either.

export async function TopNav() {
  const t = await getTranslations('nav');
  const [user, earlyBirdEntry] = await Promise.all([
    getCurrentUser(),
    getCampaignEntryState('early-bird'),
  ]);
  const isAuthed = user !== null;

  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          rewrite.so
        </Link>

        <div className={styles.centerLinks}>
          <Link href="/try" className={styles.link}>
            {t('try')}
          </Link>
          <Link href="/pricing" className={styles.link}>
            {t('pricing')}
          </Link>
          {earlyBirdEntry.showBadge && (
            <Link href="/early-bird" className={`${styles.link} ${styles.linkEarlyBird}`}>
              {t('earlyBird')}
            </Link>
          )}
          <a
            href="https://github.com/rewrite-so/rewrite.so"
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('github')}
          </a>
        </div>

        <LanguageSwitcher />
        {isAuthed ? (
          <>
            <CtaLink
              cta="install"
              href={getExtensionInstallUrl()}
              external
              className={styles.ctaOutline}
            >
              {t('install')}
            </CtaLink>
            <Link href="/settings" className={styles.ctaPrimary}>
              {t('settings')}
            </Link>
          </>
        ) : (
          <>
            <CtaLink cta="signin" href="/login" className={styles.ctaSignIn}>
              {t('signIn')}
            </CtaLink>
            <CtaLink
              cta="install"
              href={getExtensionInstallUrl()}
              external
              className={styles.ctaOutline}
            >
              {t('install')}
            </CtaLink>
            <CtaLink cta="try_demo" href="/try" className={styles.ctaPrimary}>
              {t('tryFree')}
            </CtaLink>
          </>
        )}
      </div>
    </nav>
  );
}
