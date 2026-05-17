import { useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation.ts';
import { getExtensionInstallUrl } from '../lib/extension-install-url.ts';
import styles from './Footer.module.css';

export function Footer() {
  const t = useTranslations('footer');
  return (
    <footer className={styles.footer}>
      <div className={styles.grid}>
        <div>
          <div className={styles.brand}>
            rewrite.so<span className={styles.brandTm}>™</span>
          </div>
          <div className={styles.tagline}>{t('tagline')}</div>
        </div>

        <div>
          <h4 className={styles.colHeading}>{t('heading.product')}</h4>
          <Link href="/" className={styles.link}>
            {t('link.home')}
          </Link>
          <a
            href={getExtensionInstallUrl()}
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('link.install')}
          </a>
          <Link href="/try" className={styles.link}>
            {t('link.tryIt')}
          </Link>
          <Link href="/pricing" className={styles.link}>
            {t('link.pricing')}
          </Link>
        </div>

        <div>
          <h4 className={styles.colHeading}>{t('heading.account')}</h4>
          <Link href="/login" className={styles.link}>
            {t('link.signIn')}
          </Link>
          <Link href="/settings" className={styles.link}>
            {t('link.settings')}
          </Link>
          <Link href="/billing" className={styles.link}>
            {t('link.billing')}
          </Link>
        </div>

        <div>
          <h4 className={styles.colHeading}>{t('heading.legal')}</h4>
          <Link href="/terms" className={styles.link}>
            {t('link.terms')}
          </Link>
          <Link href="/privacy" className={styles.link}>
            {t('link.privacy')}
          </Link>
          <Link href="/refund" className={styles.link}>
            {t('link.refund')}
          </Link>
          <Link href="/aup" className={styles.link}>
            {t('link.aup')}
          </Link>
        </div>

        <div>
          <h4 className={styles.colHeading}>{t('heading.support')}</h4>
          <Link href="/contact" className={styles.link}>
            {t('link.contact')}
          </Link>
          <a
            href="https://stats.uptimerobot.com/ISstIMdFhH"
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('link.serviceStatus')}
          </a>
          <a href="mailto:hello@rewrite.so" className={styles.link}>
            hello@rewrite.so
          </a>
          <a
            href="https://github.com/rewrite-so/rewrite.so"
            className={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('link.github')}
          </a>
        </div>
      </div>

      <div className={styles.disclaimer}>{t('disclaimer')}</div>

      <div className={styles.bottomBar}>
        <span>{t('copyright', { year: new Date().getFullYear() })}</span>
        <span>
          {t.rich('paymentsBy', {
            creem: (chunks) => (
              <a
                href="https://creem.io"
                className={styles.creemLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
        </span>
      </div>
    </footer>
  );
}
