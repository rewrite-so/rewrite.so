'use client';

import type { CSSProperties, ReactNode } from 'react';
import { Link } from '../i18n/navigation.ts';
import { track } from '../lib/analytics.ts';

/**
 * Single-purpose CTA wrapper that emits `cta_click` on click.
 *
 * Two flavors:
 * - Internal links use next-intl Link so locale prefixing + client routing
 *   continue to work the same as before.
 * - External links (extension install, GitHub, etc.) render a plain anchor
 *   with target=_blank.
 *
 * The `cta` prop is the analytics tag — match the allowed values listed in
 * packages/shared/src/events.ts:cta_click props.
 */
export type CtaName = 'install' | 'signin' | 'try_demo' | 'pricing' | 'github';

interface BaseProps {
  cta: CtaName;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

interface InternalProps extends BaseProps {
  href: string;
  external?: false;
}

interface ExternalProps extends BaseProps {
  href: string;
  external: true;
}

export function CtaLink(props: InternalProps | ExternalProps) {
  const fireEvent = () => {
    track('cta_click', { cta: props.cta });
  };

  if (props.external) {
    return (
      <a
        href={props.href}
        className={props.className}
        style={props.style}
        target="_blank"
        rel="noopener noreferrer"
        onClick={fireEvent}
      >
        {props.children}
      </a>
    );
  }
  return (
    <Link href={props.href} className={props.className} style={props.style} onClick={fireEvent}>
      {props.children}
    </Link>
  );
}
