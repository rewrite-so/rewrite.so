/**
 * Web user-behavior analytics sender — vanilla TS, no framework deps.
 *
 * Contract (matches apps/api/src/routes/events.ts):
 * - Queues events in memory, flushes every 5s or at 10 events, whichever
 *   comes first. pagehide / beforeunload uses navigator.sendBeacon so we
 *   don't drop end-of-session pageviews.
 * - visitor_id lives in sessionStorage ('rs_vid'); no cookie. This is the
 *   single anchor that lets the server JOIN anonymous events to a future
 *   logged-in user (via signin_success.linked_visitor_id).
 * - eventsEnabled gate: if /v1/me reports the kill switch is on, every
 *   track() call no-ops. Bootstrap with the value resolved at page load;
 *   sender does not poll.
 * - Errors swallowed: telemetry never disrupts the page (matches the
 *   apps/api fire-and-forget contract).
 *
 * This module is consumed both by app/[locale]/layout.tsx (Bootstrap +
 * PageViewTracker) and by click handlers in feature components.
 */
import type { EventName } from '@rewrite/shared';

const STORAGE_KEY = 'rs_vid';
const FLUSH_INTERVAL_MS = 5000;
const BATCH_SIZE = 10;
const ENDPOINT = '/v1/events';

interface UtmTags {
  source?: string;
  medium?: string;
  campaign?: string;
}

interface QueuedEvent {
  name: EventName;
  ts: number;
  page: string;
  locale: string;
  referrer_host?: string;
  utm?: UtmTags;
  visitor_id?: string;
  device_type?: 'mobile' | 'desktop' | 'tablet';
  props?: Record<string, string | number>;
}

interface ContextSnapshot {
  referrerHost?: string;
  utm?: UtmTags;
  deviceType?: 'mobile' | 'desktop' | 'tablet';
}

let enabled = true;
let initialized = false;
let currentLocale = 'en';
let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let contextSnapshot: ContextSnapshot = {};

/** UA-driven, deliberately coarse — we never want a fingerprintable string. */
function detectDeviceType(): 'mobile' | 'desktop' | 'tablet' | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

/** Pull referrer host (strip path / query) and UTM tags from the current URL. */
function captureContext(): ContextSnapshot {
  const snap: ContextSnapshot = {};
  if (typeof document !== 'undefined' && document.referrer) {
    try {
      const url = new URL(document.referrer);
      // Only record cross-origin referrers; self-referrals are noise.
      if (typeof location !== 'undefined' && url.host !== location.host) {
        snap.referrerHost = url.host;
      }
    } catch {
      // ignore unparseable referrers
    }
  }
  if (typeof location !== 'undefined') {
    try {
      const params = new URLSearchParams(location.search);
      const source = params.get('utm_source') ?? undefined;
      const medium = params.get('utm_medium') ?? undefined;
      const campaign = params.get('utm_campaign') ?? undefined;
      if (source || medium || campaign) {
        snap.utm = {
          ...(source ? { source } : {}),
          ...(medium ? { medium } : {}),
          ...(campaign ? { campaign } : {}),
        };
      }
    } catch {
      // ignore malformed URLs
    }
  }
  snap.deviceType = detectDeviceType();
  return snap;
}

/** Lazily generate + persist a session-scoped visitor id (UUID v4). */
function ensureVisitorId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const existing = window.sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `vid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // sessionStorage can throw in private-browsing / cookies-blocked scenarios
    return undefined;
  }
}

/** Strip the optional /<locale> prefix so blob2 holds clean route paths. */
const LOCALE_PREFIX_RE = /^\/(en|zh-CN|ja|ko|es|fr|de)(\/|$)/;
export function stripLocalePrefix(path: string): string {
  const m = path.match(LOCALE_PREFIX_RE);
  if (!m) return path;
  const suffix = path.slice(m[0].length - (m[2] === '/' ? 1 : 0));
  return suffix.length === 0 ? '/' : suffix;
}

export interface InitOptions {
  locale: string;
  /** Result of GET /v1/me.eventsEnabled — gates the entire SDK. */
  eventsEnabled: boolean;
}

/**
 * Wire the sender to the page. Safe to call multiple times — second call
 * is a no-op (avoids re-binding pagehide listeners on locale change).
 */
export function init({ locale, eventsEnabled }: InitOptions): void {
  currentLocale = locale;
  enabled = eventsEnabled;
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  contextSnapshot = captureContext();

  // Flush queued events on tab close / nav-away. pagehide is the modern
  // replacement for beforeunload and fires consistently even on iOS.
  const handlePageHide = () => {
    flush({ useBeacon: true });
  };
  window.addEventListener('pagehide', handlePageHide);
}

/**
 * Update the SDK-wide enabled flag without re-binding listeners. Useful when
 * /v1/me is re-fetched (e.g. after sign-in changes the user's setting).
 */
export function setEventsEnabled(value: boolean): void {
  enabled = value;
  if (!enabled) {
    queue = [];
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }
}

export function isEnabled(): boolean {
  return enabled;
}

export function getVisitorId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Enqueue an event. When `name === 'signin_success'` and props.linked_visitor_id
 * is missing, we backfill it from the current visitor id — this is the single
 * cross-session anchor that ties the pre-signin visitor cohort to the user's
 * future logged-in activity (see plan + CLAUDE.md "用户行为分析").
 */
export function track(name: EventName, props?: Record<string, string | number>): void {
  if (!enabled) return;
  if (typeof window === 'undefined') return;

  const visitorId = ensureVisitorId();
  let mergedProps = props;
  if (name === 'signin_success' && visitorId && (!props || !('linked_visitor_id' in props))) {
    mergedProps = { ...(props ?? {}), linked_visitor_id: visitorId };
  }

  const path = stripLocalePrefix(location.pathname || '/');
  const event: QueuedEvent = {
    name,
    ts: Date.now(),
    page: path,
    locale: currentLocale,
    ...(contextSnapshot.referrerHost ? { referrer_host: contextSnapshot.referrerHost } : {}),
    ...(contextSnapshot.utm ? { utm: contextSnapshot.utm } : {}),
    ...(visitorId ? { visitor_id: visitorId } : {}),
    ...(contextSnapshot.deviceType ? { device_type: contextSnapshot.deviceType } : {}),
    ...(mergedProps ? { props: mergedProps } : {}),
  };
  queue.push(event);

  if (queue.length >= BATCH_SIZE) {
    flush();
    return;
  }
  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, FLUSH_INTERVAL_MS);
  }
}

interface FlushOptions {
  useBeacon?: boolean;
}

/**
 * Ship the current queue. Errors are swallowed; the queue is reset
 * regardless so we don't pile up retry attempts that would amplify a
 * server outage.
 */
export function flush(opts: FlushOptions = {}): void {
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (typeof window === 'undefined') return;

  const body = JSON.stringify({ events });

  if (opts.useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    try {
      // Explicit application/json Blob so the server sees the right
      // Content-Type — sendBeacon's default is text/plain for strings.
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    } catch {
      // fall through to fetch
    }
  }

  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body,
    }).catch(() => undefined);
  } catch {
    // swallow synchronous fetch errors too
  }
}

/** Test-only: reset module state between cases. */
export function __resetForTests(): void {
  enabled = true;
  initialized = false;
  currentLocale = 'en';
  queue = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  contextSnapshot = {};
}
