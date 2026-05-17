import type { ReactNode } from 'react';
import styles from './Kbd.module.css';

type KbdProps = {
  children?: ReactNode;
  size?: 'sm' | 'md';
};

export function Kbd({ children, size = 'md' }: KbdProps) {
  return (
    <kbd className={styles.kbd} data-size={size}>
      {children}
    </kbd>
  );
}
