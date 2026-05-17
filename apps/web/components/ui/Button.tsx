import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

type SharedProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // children is optional so callers can pass it positionally via
  // React.createElement(Button, props, ...children) — biome's noChildrenProp
  // rule disallows explicit `children` props in JSX.
  children?: ReactNode;
  className?: string;
};

type ButtonAsButton = SharedProps & {
  as?: 'button';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof SharedProps>;

type ButtonAsAnchor = SharedProps & {
  as: 'a';
  href: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof SharedProps>;

export type ButtonProps = ButtonAsButton | ButtonAsAnchor;

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', className, children, ...rest } = props;
  const cls = className ? `${styles.button} ${className}` : styles.button;

  if (props.as === 'a') {
    const { as: _as, ...anchorRest } = rest as ButtonAsAnchor;
    return (
      <a className={cls} data-variant={variant} data-size={size} {...anchorRest}>
        {children}
      </a>
    );
  }

  const { as: _as, ...buttonRest } = rest as ButtonAsButton;
  return (
    <button type="button" className={cls} data-variant={variant} data-size={size} {...buttonRest}>
      {children}
    </button>
  );
}
