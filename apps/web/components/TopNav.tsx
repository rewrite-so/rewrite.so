import { useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation.ts';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';

const NAV_LINK = {
  fontSize: 14,
  color: '#444',
  textDecoration: 'none',
  padding: '6px 10px',
};

const NAV_LINK_PRIMARY = {
  fontSize: 14,
  color: '#fff',
  background: '#111',
  textDecoration: 'none',
  padding: '7px 14px',
  borderRadius: 6,
  fontWeight: 500,
};

export function TopNav() {
  const t = useTranslations('nav');
  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'saturate(180%) blur(8px)',
        WebkitBackdropFilter: 'saturate(180%) blur(8px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {/* Brand */}
        <Link
          href="/"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#111',
            textDecoration: 'none',
            marginRight: 24,
            letterSpacing: '-0.01em',
          }}
        >
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
        </Link>

        {/* Center links */}
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <Link href="/try" style={NAV_LINK}>
            {t('try')}
          </Link>
          <Link href="/pricing" style={NAV_LINK}>
            {t('pricing')}
          </Link>
          <a
            href="https://github.com/rewrite-so/rewrite.so"
            style={NAV_LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('github')}
          </a>
        </div>

        {/* Right: language switcher + CTAs */}
        <LanguageSwitcher />
        <Link href="/login" style={{ ...NAV_LINK, marginLeft: 4 }}>
          {t('signIn')}
        </Link>
        <Link href="/try" style={{ ...NAV_LINK_PRIMARY, marginLeft: 8 }}>
          {t('tryFree')}
        </Link>
      </div>
    </nav>
  );
}
