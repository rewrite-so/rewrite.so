import type { ReactNode } from 'react';
import styles from './SectionHeader.module.css';

type SectionHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'left' | 'center';
};

export function SectionHeader({ eyebrow, title, subtitle, align = 'left' }: SectionHeaderProps) {
  return (
    <header className={styles.header} data-align={align}>
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      <h2 className={styles.title}>{title}</h2>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
