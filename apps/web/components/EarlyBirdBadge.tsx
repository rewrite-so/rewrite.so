import { getTranslations } from 'next-intl/server';
import { Link } from '../i18n/navigation.ts';

/**
 * Hero-region eyebrow-style pill that links to /early-bird. Rendered only
 * when `getCampaignEntryState('early-bird').showBadge === true` (see
 * apps/web/lib/campaign-entry.ts).
 *
 * Styling: amber (`#7a5a18`) matches the TopNav Early Bird link so the
 * two entry surfaces feel like one product. Sits above `<h1>` in the
 * hero, replacing none of the existing hero copy — when not rendered,
 * there's no layout shift.
 */
export async function EarlyBirdBadge() {
  const t = await getTranslations('home.earlyBirdBadge');
  return (
    <Link
      href="/early-bird"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        margin: '0 0 16px',
        padding: '6px 12px',
        borderRadius: 999,
        background: '#fdfaf2',
        color: '#7a5a18',
        border: '1px solid #f0e4cf',
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        letterSpacing: 0,
      }}
    >
      <span aria-hidden="true">⚡</span>
      <span>{t('label')}</span>
      <span aria-hidden="true" style={{ marginLeft: 2 }}>
        →
      </span>
    </Link>
  );
}
