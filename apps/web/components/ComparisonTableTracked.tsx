'use client';

import { useEffect, useRef } from 'react';
import { track } from '../lib/analytics.ts';
import { ComparisonTable, type ComparisonTableProps } from './ui/ComparisonTable.tsx';

/**
 * Client wrapper around the ComparisonTable primitive that emits
 * `compare_row_expand` when a row's <details> is opened. The tracking lives
 * here, not in the primitive — ComparisonTable stays a pure server component
 * with no analytics dependency.
 *
 * The `toggle` event does not bubble, so listeners are attached per <details>
 * element rather than delegated. Only rows with a `detail` render a <details>,
 * so indices are aligned against that filtered subset.
 */
export function ComparisonTableTracked(props: ComparisonTableProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const trackedRows = props.rows.filter((r) => r.detail);
    const detailsEls = Array.from(root.querySelectorAll('details'));
    const fired = new Set<number>();
    const cleanups = detailsEls.map((el, i) => {
      const onToggle = () => {
        if (!el.open || fired.has(i)) return;
        fired.add(i);
        const key = trackedRows[i]?.key;
        if (key) track('compare_row_expand', { row: key });
      };
      el.addEventListener('toggle', onToggle);
      return () => el.removeEventListener('toggle', onToggle);
    });
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [props.rows]);

  return (
    <div ref={ref}>
      <ComparisonTable {...props} />
    </div>
  );
}
