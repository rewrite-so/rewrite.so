/**
 * Web user-behavior analytics sender — vanilla TS, no framework deps.
 *
 * Contract (matches apps/api/src/routes/events.ts):
 * - Queues events in memory, flushes every 5s or at 10 events, whichever
 *   comes first. pagehide / beforeunload uses navigator.sendBeacon so we
 *   don't drop end-of-session pageviews.
 * - visitor_id lives in localStorage ('rs_vid'); no cookie. Persistent across
 *   sessions so returning visitors are trackable; it is the single anchor that
 *   lets the server JOIN anonymous events to a future logged-in user (via
 *   signin_success.linked_visitor_id).
 * - session_id lives in sessionStorage ('rs_sid'); rolls after 30 min idle.
 *   Per browsing session — distinct from the persistent visitor_id.
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
const SESSION_KEY = 'rs_sid';
const SESSION_IDLE_MS = 30 * 60 * 1000;
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
  session_id?: string;
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

/**
 * Buffer for track() calls that arrive before init() has resolved /v1/me.
 * Common race: SettingsClient mounts and emits signin_success synchronously
 * while AnalyticsBootstrap's async fetch is still in-flight. Without this
 * buffer, the event would queue with `currentLocale='en'` default regardless
 * of the actual route locale. init() drains this list once the real locale
 * and context snapshot are known.
 *
 * Capped to keep an init-that-never-arrives from leaking memory; far above
 * any realistic pre-init burst.
 */
const PENDING_TRACK_CAP = 50;
interface PendingTrack {
  name: EventName;
  props?: Record<string, string | number>;
  ts: number;
}
let pendingTracks: PendingTrack[] = [];

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

function randomId(prefix: string): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lazily generate + persist a *persistent* visitor id (UUID v4) in
 * localStorage, so a returning visitor keeps the same id across sessions.
 *
 * One-time migration: a user mid-session at the deploy that flipped rs_vid
 * from sessionStorage to localStorage still has an id in sessionStorage —
 * promote it so their identity (and signin_success anchor) survives.
 */
function ensureVisitorId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const legacy = window.sessionStorage.getItem(STORAGE_KEY) ?? undefined;
    const id = legacy ?? randomId('vid');
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage can throw in private-browsing / storage-blocked scenarios
    return undefined;
  }
}

/**
 * Lazily generate + persist a per-session id in sessionStorage. Rolls after
 * SESSION_IDLE_MS of inactivity. Stored as `{ id, lastSeen }`; every call
 * refreshes `lastSeen`. A new tab starts a fresh session — matches the
 * "per browsing session" intent. Distinct from the persistent visitor id.
 */
function ensureSessionId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const now = Date.now();
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { id?: unknown; lastSeen?: unknown };
        if (
          typeof parsed.id === 'string' &&
          typeof parsed.lastSeen === 'number' &&
          now - parsed.lastSeen <= SESSION_IDLE_MS
        ) {
          window.sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify({ id: parsed.id, lastSeen: now }),
          );
          return parsed.id;
        }
      } catch {
        // malformed value — fall through and mint a fresh session
      }
    }
    const id = randomId('sid');
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastSeen: now }));
    return id;
  } catch {
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
 * Wire the sender to the page. Safe to call multiple times.
 *
 * Second-call semantics matter: callers in locale-change effects pass a fresh
 * `locale` plus an `eventsEnabled` they can't actually re-derive (no second
 * `/v1/me` fetch). We only honor the kill-switch result from the *first*
 * call so a locale switch can never resurrect a disabled SDK.
 * Re-enabling the SDK is intentionally not a runtime knob — flip the env
 * var and reload.
 */
export function init({ locale, eventsEnabled }: InitOptions): void {
  currentLocale = locale;
  if (initialized || typeof window === 'undefined') {
    // Don't touch `enabled` on re-entry — that's the kill-switch latch.
    return;
  }
  enabled = eventsEnabled;
  initialized = true;
  contextSnapshot = captureContext();

  // Drain pre-init buffer with the now-resolved locale + context snapshot.
  // Preserve each event's original timestamp so timing analyses see when the
  // user actually triggered the action, not when init resolved.
  if (pendingTracks.length > 0) {
    const drain = pendingTracks;
    pendingTracks = [];
    if (enabled) {
      for (const p of drain) enqueueEvent(p.name, p.props, p.ts);
    }
  }

  // Flush queued events on tab close / nav-away. pagehide is the modern
  // replacement for beforeunload and fires consistently even on iOS.
  const handlePageHide = () => {
    flush({ useBeacon: true });
  };
  window.addEventListener('pagehide', handlePageHide);
}

/**
 * Disable the SDK at runtime and drop any queued events.
 *
 * Intentionally one-way: there is no public "enable" path. The kill switch
 * latches at the first `init()` call (which honors the /v1/me response) and
 * can only be flipped *off* — re-enabling requires flipping `EVENTS_DISABLED`
 * and reloading. This matches the contract documented on `init()`: an
 * ops-driven kill switch shouldn't be defeatable by browser-side state
 * changes (locale flip, post-signin /v1/me refetch, etc.).
 */
export function disableEvents(): void {
  enabled = false;
  queue = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

export function isEnabled(): boolean {
  return enabled;
}

export function getVisitorId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Enqueue an event. When `name === 'signin_success'` and props.linked_visitor_id
 * is missing, we backfill it from the current visitor id — this is the single
 * cross-session anchor that ties the pre-signin visitor cohort to the user's
 * future logged-in activity (see plan + CLAUDE.md "用户行为分析").
 *
 * Pre-init callers (e.g. SettingsClient emitting signin_success the moment it
 * mounts, while AnalyticsBootstrap's /v1/me fetch is still in-flight) are
 * buffered into `pendingTracks` and drained inside init() with the resolved
 * locale + context snapshot. Without that buffer the locale field defaults
 * to 'en' regardless of the actual route locale.
 */
export function track(name: EventName, props?: Record<string, string | number>): void {
  if (!enabled) return;
  if (typeof window === 'undefined') return;

  if (!initialized) {
    if (pendingTracks.length < PENDING_TRACK_CAP) {
      pendingTracks.push({ name, props, ts: Date.now() });
    }
    return;
  }

  enqueueEvent(name, props, Date.now());
}

/** Build + queue a single event with the *current* context snapshot. */
function enqueueEvent(
  name: EventName,
  props: Record<string, string | number> | undefined,
  ts: number,
): void {
  const visitorId = ensureVisitorId();
  const sessionId = ensureSessionId();
  let mergedProps = props;
  if (name === 'signin_success' && visitorId && (!props || !('linked_visitor_id' in props))) {
    mergedProps = { ...(props ?? {}), linked_visitor_id: visitorId };
  }

  const path = stripLocalePrefix(location.pathname || '/');
  const event: QueuedEvent = {
    name,
    ts,
    page: path,
    locale: currentLocale,
    ...(contextSnapshot.referrerHost ? { referrer_host: contextSnapshot.referrerHost } : {}),
    ...(contextSnapshot.utm ? { utm: contextSnapshot.utm } : {}),
    ...(visitorId ? { visitor_id: visitorId } : {}),
    ...(sessionId ? { session_id: sessionId } : {}),
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
  pendingTracks = [];
}
