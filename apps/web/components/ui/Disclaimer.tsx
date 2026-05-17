import type { ReactNode } from 'react';
import styles from './Disclaimer.module.css';

type DisclaimerProps = {
  children: ReactNode;
};

export function Disclaimer({ children }: DisclaimerProps) {
  return <p className={styles.disclaimer}>{children}</p>;
}
