import type { ReactNode } from 'react';
import styles from './Badge.module.css';

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'inverse';

type BadgeProps = {
  children: ReactNode;
  variant?: BadgeVariant;
};

export function Badge({ children, variant = 'default' }: BadgeProps) {
  return (
    <span className={styles.badge} data-variant={variant}>
      {children}
    </span>
  );
}
