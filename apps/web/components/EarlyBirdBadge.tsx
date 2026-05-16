import { getTranslations } from 'next-intl/server';
import { Link } from '../i18n/navigation.ts';
import styles from './EarlyBirdBadge.module.css';

/**
 * Hero-region eyebrow-style pill that links to /early-bird. Rendered only
 * when `getCampaignEntryState('early-bird').showBadge === true` (see
 * apps/web/lib/campaign-entry.ts).
 *
 * Styling: amber (`#7a5a18`) matches the TopNav Early Bird link so the
 * two entry surfaces feel like one product. A 2s pulsing box-shadow ring
 * draws attention without being intrusive; it's auto-disabled for users
 * with `prefers-reduced-motion`. See EarlyBirdBadge.module.css.
 */
export async function EarlyBirdBadge() {
  const t = await getTranslations('home.earlyBirdBadge');
  return (
    <Link href="/early-bird" className={styles.badge}>
      <span aria-hidden="true" className={styles.bolt}>
        ⚡
      </span>
      <span>{t('label')}</span>
      <span aria-hidden="true" className={styles.arrow}>
        →
      </span>
    </Link>
  );
}
