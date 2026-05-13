'use client';

import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useEffect, useRef } from 'react';
import { flush, init, track } from '../lib/analytics.ts';

/**
 * Mount once inside `app/[locale]/layout.tsx` to wire the analytics sender to
 * the router. Three responsibilities, one per effect:
 *
 * 1. Bootstrap: GET /v1/me to read `eventsEnabled` (operations kill switch),
 *    then `init()` the SDK. We store the bootstrap promise on a ref so the
 *    other effects can chain off it without racing the network call.
 *
 * 2. Locale tracking: re-`init()` with the new currentLocale whenever the URL
 *    locale segment changes. Does not refetch /v1/me.
 *
 * 3. page_view emission: fires on first paint with `is_first_visit:1`, then
 *    on every distinct pathname. The visited-paths ref de-dupes navigations
 *    that resolve to the same path (e.g. hash-only changes).
 *
 * The component renders nothing.
 */
export function AnalyticsBootstrap() {
  const locale = useLocale();
  const pathname = usePathname();
  const lastEmittedPath = useRef<string | null>(null);
  const bootstrapRef = useRef<Promise<void> | null>(null);
  const localeRef = useRef(locale);

  // Update the ref so the once-only bootstrap effect sees the latest locale at
  // mount time without needing to list it in its dependency array.
  localeRef.current = locale;

  // ---- 1. Bootstrap (once) ----
  useEffect(() => {
    bootstrapRef.current = (async () => {
      let eventsEnabled = true;
      try {
        const res = await fetch('/v1/me', { credentials: 'include' });
        if (res.ok) {
          const body = (await res.json()) as { eventsEnabled?: boolean };
          if (typeof body.eventsEnabled === 'boolean') {
            eventsEnabled = body.eventsEnabled;
          }
        }
      } catch {
        // Network failure during bootstrap: keep eventsEnabled=true. Operations
        // emergencies are low-frequency; defaulting open is the right tradeoff.
      }
      init({ locale: localeRef.current, eventsEnabled });
    })();
  }, []);

  // ---- 2. Locale tracking ----
  useEffect(() => {
    const promise = bootstrapRef.current;
    if (!promise) return;
    promise.then(() => init({ locale, eventsEnabled: true })).catch(() => undefined);
  }, [locale]);

  // ---- 3. page_view emission ----
  useEffect(() => {
    const path = pathname ?? '/';
    if (lastEmittedPath.current === path) return;
    const isFirstVisit = lastEmittedPath.current === null;
    lastEmittedPath.current = path;
    const promise = bootstrapRef.current;
    if (!promise) return;
    promise
      .then(() => {
        if (isFirstVisit) {
          track('page_view', { is_first_visit: 1 });
        } else {
          track('page_view');
        }
      })
      .catch(() => undefined);
  }, [pathname]);

  // ---- Defensive pagehide flush — analytics.init() also wires this, but the
  // listener may not be in place if the user navigates away before bootstrap
  // resolves. Belt-and-braces.
  useEffect(() => {
    const onHide = () => {
      flush({ useBeacon: true });
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  return null;
}
