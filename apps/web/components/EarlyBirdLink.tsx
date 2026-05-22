'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Link } from '../i18n/navigation.ts';
import { track } from '../lib/analytics.ts';

/**
 * Client wrapper around the /early-bird link that emits `early_bird_banner_click`
 * on click. Used by the surfaces that promote the campaign — the hero badge
 * and the TopNav link — so the funnel can attribute campaign entries by
 * surface. `surface` must match the values in packages/shared/src/events.ts.
 */
export function EarlyBirdLink({
  surface,
  className,
  style,
  children,
}: {
  surface: 'hero' | 'pricing' | 'nav';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <Link
      href="/early-bird"
      className={className}
      style={style}
      onClick={() => track('early_bird_banner_click', { surface })}
    >
      {children}
    </Link>
  );
}
