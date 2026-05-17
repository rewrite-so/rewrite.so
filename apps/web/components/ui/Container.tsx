import type { ElementType, ReactNode } from 'react';
import styles from './Container.module.css';

type ContainerProps = {
  as?: ElementType;
  children: ReactNode;
  className?: string;
};

export function Container({ as: As = 'div', children, className }: ContainerProps) {
  const cls = className ? `${styles.container} ${className}` : styles.container;
  return <As className={cls}>{children}</As>;
}
