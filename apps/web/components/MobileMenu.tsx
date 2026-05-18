'use client';

import { useEffect, useRef, useState } from 'react';
import { Link } from '../i18n/navigation.ts';
import { track } from '../lib/analytics.ts';
import styles from './MobileMenu.module.css';

// Hamburger 触发的下拉 panel。仅 < 900px 显示(由父级 TopNav.module.css 控制).
// panel 内容:Pricing / Early Bird(条件) / Sign In(未登录) / Install。
// Settings / Try Free 是主 CTA,始终在 nav 上,不重复进 panel。
//
// 不复用 CtaLink:它内部 onClick 固定为 track(),不接受外层 onClick / role,
// 我们需要 onClick(close panel) + role(menuitem)。这里手动调 track 复现埋点。

interface MobileMenuLabels {
  menu: string;
  pricing: string;
  earlyBird: string;
  github: string;
  signIn: string;
  install: string;
}

interface MobileMenuProps {
  isAuthed: boolean;
  installUrl: string;
  earlyBirdVisible: boolean;
  labels: MobileMenuLabels;
}

export function MobileMenu({ isAuthed, installUrl, earlyBirdVisible, labels }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      const root = rootRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const idx = items.findIndex((el) => el === document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        items[(idx + 1 + items.length) % items.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = idx <= 0 ? items.length - 1 : idx - 1;
        items[prev]?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);
  const onSignInClick = () => {
    track('cta_click', { cta: 'signin' });
    close();
  };
  const onInstallClick = () => {
    track('cta_click', { cta: 'install' });
    close();
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <button
        type="button"
        className={styles.hamburger}
        onClick={() => setOpen((v) => !v)}
        aria-label={labels.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="mobile-menu-panel"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {open ? (
            <>
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </>
          ) : (
            <>
              <path d="M3 7h18" />
              <path d="M3 12h18" />
              <path d="M3 17h18" />
            </>
          )}
        </svg>
      </button>
      {open && (
        <div id="mobile-menu-panel" className={styles.panel} role="menu">
          <Link href="/pricing" className={styles.panelItem} role="menuitem" onClick={close}>
            {labels.pricing}
          </Link>
          {earlyBirdVisible && (
            <Link
              href="/early-bird"
              className={`${styles.panelItem} ${styles.panelItemEarlyBird}`}
              role="menuitem"
              onClick={close}
            >
              {labels.earlyBird}
            </Link>
          )}
          <a
            href="https://github.com/rewrite-so/rewrite.so"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.panelItem}
            role="menuitem"
            onClick={close}
          >
            {labels.github}
          </a>
          {!isAuthed && (
            <Link
              href="/login"
              className={styles.panelItem}
              role="menuitem"
              onClick={onSignInClick}
            >
              {labels.signIn}
            </Link>
          )}
          <a
            href={installUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.panelItem}
            role="menuitem"
            onClick={onInstallClick}
          >
            {labels.install}
          </a>
        </div>
      )}
    </div>
  );
}
