'use client';

import { useRef } from 'react';
import { track } from '../../lib/analytics.ts';
import styles from './HomePage.module.css';

/**
 * Landing-page pricing teaser card. Client component so it can emit
 * `pricing_card_focus` after a dwell — a hover or keyboard focus held for
 * FOCUS_DWELL_MS, which filters out cursor fly-overs. Fires at most once per
 * card per pageview.
 */
const FOCUS_DWELL_MS = 500;

type PricingCard = 'free' | 'pro' | 'byok';

export function PriceTeaser({
  card,
  title,
  price,
  sub,
  features,
}: {
  card: PricingCard;
  title: string;
  price: string;
  sub: string;
  features: string[];
}) {
  const dwellTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const startDwell = () => {
    if (fired.current || dwellTimer.current !== null) return;
    dwellTimer.current = setTimeout(() => {
      dwellTimer.current = null;
      fired.current = true;
      track('pricing_card_focus', { card });
    }, FOCUS_DWELL_MS);
  };
  const cancelDwell = () => {
    if (dwellTimer.current !== null) {
      clearTimeout(dwellTimer.current);
      dwellTimer.current = null;
    }
  };

  const cls = [
    styles.priceCard,
    card === 'pro' && styles.priceCardHighlight,
    card === 'byok' && styles.priceCardByok,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={cls}
      onMouseEnter={startDwell}
      onMouseLeave={cancelDwell}
      onFocus={startDwell}
      onBlur={cancelDwell}
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
