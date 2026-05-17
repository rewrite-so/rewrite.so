import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Link } from '../i18n/navigation.ts';
import { getCampaignEntryState } from '../lib/campaign-entry.ts';
import { getExtensionInstallUrl } from '../lib/extension-install-url.ts';
import { CtaLink } from './CtaLink.tsx';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import styles from './TopNav.module.css';

interface MeUser {
  id: string;
  email: string;
  name?: string | null;
}

/**
 * SSR session readout — forwards web cookies into the api `/v1/me`.
 *
 * - dev: web localhost:3000 → api localhost:8787, cookie shared by host.
 * - prod: web rewrite.so → api api.rewrite.so, session cookie domain
 *   `.rewrite.so` shared across subdomains.
 *
 * `cache: 'no-store'` is mandatory — sessions must not be statically cached.
 * Any failure (missing cookies, network, api 5xx) returns null so the nav
 * gracefully falls back to anonymous; we never block render on this.
 */
async function getCurrentUser(): Promise<MeUser | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (!cookieHeader) return null;
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:8787';
    const res = await fetch(`${apiBase}/v1/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: MeUser | null };
    return data.user ?? null;
  } catch {
    return null;
  }
}

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
