import { useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation.ts';

const COL_HEADING = {
  fontSize: 12,
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase' as const,
  letterSpacing: 0,
  margin: 0,
  marginBottom: 12,
};

const LINK = {
  display: 'block',
  fontSize: 13,
  color: '#444',
  textDecoration: 'none',
  padding: '4px 0',
};

export function Footer() {
  const t = useTranslations('footer');
  return (
    <footer
      style={{
        marginTop: 80,
        borderTop: '1px solid #e4e4e7',
        background: '#fafafa',
        padding: '40px 24px 32px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 32,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>
            rewrite.so
            <span
              style={{
                fontSize: 9,
                fontWeight: 500,
                verticalAlign: 'super',
                marginLeft: 1,
                color: '#888',
              }}
            >
              ™
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.55 }}>{t('tagline')}</div>
        </div>

        <div>
          <h4 style={COL_HEADING}>{t('heading.product')}</h4>
          <Link href="/" style={LINK}>
            {t('link.home')}
          </Link>
          <Link href="/try" style={LINK}>
            {t('link.tryIt')}
          </Link>
          <Link href="/pricing" style={LINK}>
            {t('link.pricing')}
          </Link>
        </div>

        <div>
          <h4 style={COL_HEADING}>{t('heading.account')}</h4>
          <Link href="/login" style={LINK}>
            {t('link.signIn')}
          </Link>
          <Link href="/settings" style={LINK}>
            {t('link.settings')}
          </Link>
          <Link href="/billing" style={LINK}>
            {t('link.billing')}
          </Link>
        </div>

        <div>
          <h4 style={COL_HEADING}>{t('heading.legal')}</h4>
          <Link href="/terms" style={LINK}>
            {t('link.terms')}
          </Link>
          <Link href="/privacy" style={LINK}>
            {t('link.privacy')}
          </Link>
          <Link href="/refund" style={LINK}>
            {t('link.refund')}
          </Link>
          <Link href="/aup" style={LINK}>
            {t('link.aup')}
          </Link>
        </div>

        <div>
          <h4 style={COL_HEADING}>{t('heading.support')}</h4>
          <Link href="/contact" style={LINK}>
            {t('link.contact')}
          </Link>
          <a
            href="https://stats.uptimerobot.com/ISstIMdFhH"
            style={LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('link.serviceStatus')}
          </a>
          <a href="mailto:hello@rewrite.so" style={LINK}>
            hello@rewrite.so
          </a>
          <a
            href="https://github.com/rewrite-so/rewrite.so"
            style={LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('link.github')}
          </a>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1080,
          margin: '24px auto 0',
          fontSize: 11,
          color: '#999',
          lineHeight: 1.5,
          textAlign: 'center',
        }}
      >
        {t('disclaimer')}
      </div>

      <div
        style={{
          maxWidth: 1080,
          margin: '20px auto 0',
          paddingTop: 24,
          borderTop: '1px solid #e4e4e7',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 12,
          color: '#888',
        }}
      >
        <span>{t('copyright', { year: new Date().getFullYear() })}</span>
        <span>
          {t.rich('paymentsBy', {
            creem: (chunks) => (
              <a
                href="https://creem.io"
                style={{ color: '#666', textDecoration: 'none' }}
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
