'use client';

import { useEffect, useRef } from 'react';
import { track } from './analytics.ts';

/**
 * Fire a one-shot `section_view` event the first time `ref` crosses the
 * IntersectionObserver threshold. Subsequent intersections in the same
 * pageview are silently dropped — the goal is funnel-stage signal, not
 * scroll-spam.
 *
 * The dedup is per-pageview because React state resets on navigation.
 * If the user scrolls back up and down the same page, that's one view.
 *
 * Usage:
 *   const ref = useSectionView('hero');
 *   return <section ref={ref}>...</section>;
 */
export function useSectionView<E extends HTMLElement = HTMLElement>(
  section: 'hero' | 'comparison' | 'pricing' | 'privacy' | 'how' | 'features',
) {
  const ref = useRef<E>(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    // rootMargin shrinks the viewport by 30% top + bottom — small marker
    // elements (1px sentinels included) only count as "viewed" when they
    // land in the middle 40% of the screen. threshold-based detection on a
    // 1px element fires the moment a fraction of a pixel scrolls into view,
    // which feels too eager.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !firedRef.current) {
            firedRef.current = true;
            track('section_view', { section });
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '-30% 0px -30% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [section]);

  return ref;
}
