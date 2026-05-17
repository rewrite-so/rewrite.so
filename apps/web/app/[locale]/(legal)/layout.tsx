import type { ReactNode } from 'react';
import styles from './Legal.module.css';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return <main className={styles.main}>{children}</main>;
}
