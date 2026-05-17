import type { ElementType, ReactNode } from 'react';
import styles from './Card.module.css';

type CardVariant = 'default' | 'highlighted' | 'inverse' | 'dashed';
type CardPadding = 'sm' | 'md' | 'lg';

type CardProps = {
  as?: ElementType;
  variant?: CardVariant;
  padding?: CardPadding;
  children: ReactNode;
  className?: string;
};

export function Card({
  as: As = 'div',
  variant = 'default',
  padding = 'md',
  children,
  className,
}: CardProps) {
  const cls = className ? `${styles.card} ${className}` : styles.card;
  return (
    <As className={cls} data-variant={variant} data-padding={padding}>
      {children}
    </As>
  );
}
