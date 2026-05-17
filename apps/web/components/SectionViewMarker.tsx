'use client';

import { useSectionView } from '../lib/useSectionView.ts';

type SectionKey = 'hero' | 'comparison' | 'pricing' | 'privacy' | 'how' | 'features';

/**
 * Drop one of these at the top of each tracked landing section. It renders
 * a 1px sentinel that fires `section_view` once when it crosses the middle
 * 40% of the viewport (see useSectionView for rootMargin). Lets server
 * components keep their JSX while the client-only IntersectionObserver
 * logic stays isolated.
 */
export function SectionViewMarker({ section }: { section: SectionKey }) {
  const ref = useSectionView<HTMLDivElement>(section);
  return <div ref={ref} aria-hidden="true" style={{ height: 1 }} />;
}
