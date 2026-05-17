import type { ReactNode } from 'react';
import styles from './ComparisonTable.module.css';

export type ComparisonCellValue =
  | { kind: 'check'; label?: string }
  | { kind: 'cross'; label?: string }
  | { kind: 'partial'; label?: string }
  | { kind: 'text'; text: string };

export type ComparisonColumn = {
  key: string;
  /** Display name for the product column header. */
  name: string;
  /** True for the rewrite.so column — gets accent highlight + recommended badge on mobile. */
  isUs?: boolean;
};

export type ComparisonRow = {
  /** Stable row key. */
  key: string;
  /** Row label shown in the first column on desktop / each row inside cards on mobile. */
  label: string;
  /** Optional one-line explanation; rendered inside a <details> if provided. */
  detail?: string;
  /** Cell per column, keyed by ComparisonColumn.key. */
  cells: Record<string, ComparisonCellValue>;
};

type ComparisonTableProps = {
  caption: string;
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  recommendedLabel: string;
  disclaimer: ReactNode;
};

function CellMark({ value }: { value: ComparisonCellValue }) {
  if (value.kind === 'check') {
    return (
      <span className={styles.cellCheck}>
        <svg width="16" height="16" viewBox="0 0 16 16" role="img">
          <title>{value.label ?? 'yes'}</title>
          <path
            d="M3 8.5l3.2 3.2L13 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {value.label && <span className={styles.cellLabel}>{value.label}</span>}
      </span>
    );
  }
  if (value.kind === 'cross') {
    return (
      <span className={styles.cellCross}>
        <svg width="16" height="16" viewBox="0 0 16 16" role="img">
          <title>{value.label ?? 'no'}</title>
          <path
            d="M4 4l8 8M12 4l-8 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        {value.label && <span className={styles.cellLabel}>{value.label}</span>}
      </span>
    );
  }
  if (value.kind === 'partial') {
    return (
      <span className={styles.cellPartial}>
        <svg width="16" height="16" viewBox="0 0 16 16" role="img">
          <title>{value.label ?? 'partial'}</title>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 2 A6 6 0 0 1 8 14 Z" fill="currentColor" />
        </svg>
        {value.label && <span className={styles.cellLabel}>{value.label}</span>}
      </span>
    );
  }
  return <span className={styles.cellText}>{value.text}</span>;
}

export function ComparisonTable({
  caption,
  columns,
  rows,
  recommendedLabel,
  disclaimer,
}: ComparisonTableProps) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table} aria-label={caption}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.rowHeaderCol} />
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={styles.colHeader}
                data-us={col.isUs ? 'true' : undefined}
              >
                {col.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row" className={styles.rowHeader}>
                {row.detail ? (
                  <details className={styles.rowDetails}>
                    <summary className={styles.rowSummary}>{row.label}</summary>
                    <p className={styles.rowDetailText}>{row.detail}</p>
                  </details>
                ) : (
                  row.label
                )}
              </th>
              {columns.map((col) => (
                <td key={col.key} className={styles.cell} data-us={col.isUs ? 'true' : undefined}>
                  <CellMark value={row.cells[col.key] ?? { kind: 'cross' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile card layout — keeps rewrite.so as the first card with a
          "Recommended" pill, then one card per competitor. */}
      <div className={styles.cards}>
        {columns.map((col) => (
          <article key={col.key} className={styles.card} data-us={col.isUs ? 'true' : undefined}>
            <header className={styles.cardHeader}>
              <span className={styles.cardName}>{col.name}</span>
              {col.isUs && <span className={styles.cardPill}>{recommendedLabel}</span>}
            </header>
            <dl className={styles.cardList}>
              {rows.map((row) => (
                <div key={row.key} className={styles.cardRow}>
                  <dt className={styles.cardRowLabel}>{row.label}</dt>
                  <dd className={styles.cardRowValue}>
                    <CellMark value={row.cells[col.key] ?? { kind: 'cross' }} />
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>

      <p className={styles.disclaimer}>{disclaimer}</p>
    </div>
  );
}
