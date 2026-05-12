import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetForTests,
  flush,
  getVisitorId,
  init,
  isEnabled,
  setEventsEnabled,
  stripLocalePrefix,
  track,
} from './analytics.ts';

/**
 * vitest runs under `environment: 'node'` for this app, so we hand-roll the
 * browser globals each test. This keeps the SDK testable without pulling in
 * jsdom for one module.
 */
function installBrowserGlobals(
  opts: {
    search?: string;
    pathname?: string;
    referrer?: string;
    userAgent?: string;
    sessionStorageThrows?: boolean;
    noSendBeacon?: boolean;
  } = {},
) {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => {
      if (opts.sessionStorageThrows) throw new Error('blocked');
      return store.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (opts.sessionStorageThrows) throw new Error('blocked');
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    length: 0,
    key: () => null,
  } as unknown as Storage;

  const listeners = new Map<string, EventListener[]>();
  const beaconCalls: Array<{ url: string; body: unknown }> = [];
  const fetchMock: ReturnType<typeof vi.fn> = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(null, { status: 202 }),
  );

  vi.stubGlobal('window', {
    sessionStorage,
    addEventListener: (type: string, listener: EventListener) => {
      const arr = listeners.get(type) ?? [];
      arr.push(listener);
      listeners.set(type, arr);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      const arr = listeners.get(type) ?? [];
      listeners.set(
        type,
        arr.filter((l) => l !== listener),
      );
    },
  });
  vi.stubGlobal('document', { referrer: opts.referrer ?? '' });
  vi.stubGlobal('location', {
    pathname: opts.pathname ?? '/',
    search: opts.search ?? '',
    host: 'rewrite.so',
  });
  vi.stubGlobal('navigator', {
    userAgent: opts.userAgent ?? 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36',
    ...(opts.noSendBeacon
      ? {}
      : {
          sendBeacon: (url: string, body: BodyInit) => {
            beaconCalls.push({ url, body });
            return true;
          },
        }),
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    sessionStorage,
    beaconCalls,
    fetchMock,
    listeners,
    firePageHide: () => {
      for (const l of listeners.get('pagehide') ?? []) l(new Event('pagehide'));
    },
  };
}

beforeEach(() => {
  __resetForTests();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('stripLocalePrefix', () => {
  it.each([
    ['/', '/'],
    ['/try', '/try'],
    ['/en', '/'],
    ['/en/', '/'],
    ['/en/try', '/try'],
    ['/zh-CN/settings', '/settings'],
    ['/ja/billing/checkout', '/billing/checkout'],
    // unknown prefix is left intact
    ['/xx/try', '/xx/try'],
  ])('%s → %s', (input, expected) => {
    expect(stripLocalePrefix(input)).toBe(expected);
  });
});

describe('init / setEventsEnabled', () => {
  it('respects the eventsEnabled gate end-to-end', () => {
    installBrowserGlobals();
    init({ locale: 'en', eventsEnabled: false });
    expect(isEnabled()).toBe(false);
    track('page_view');
    flush();
    expect(getVisitorId()).toBeUndefined();
  });

  it('setEventsEnabled(false) clears the in-flight queue', () => {
    const env = installBrowserGlobals();
    init({ locale: 'en', eventsEnabled: true });
    track('cta_click', { cta: 'install' });
    expect(env.fetchMock).not.toHaveBeenCalled(); // not flushed yet
    setEventsEnabled(false);
    flush();
    expect(env.fetchMock).not.toHaveBeenCalled();
  });
});

describe('visitor_id management', () => {
  it('generates a UUID on first track() and reuses it', () => {
    installBrowserGlobals();
    init({ locale: 'en', eventsEnabled: true });
    track('page_view');
    const id1 = getVisitorId();
    expect(id1).toBeTruthy();
    track('cta_click', { cta: 'pricing' });
    const id2 = getVisitorId();
    expect(id2).toBe(id1);
  });

  it('tolerates sessionStorage being blocked (private browsing)', () => {
    installBrowserGlobals({ sessionStorageThrows: true });
    init({ locale: 'en', eventsEnabled: true });
    expect(() => track('page_view')).not.toThrow();
    expect(getVisitorId()).toBeUndefined();
  });
});

describe('signin_success auto-backfills linked_visitor_id', () => {
  it('attaches the current visitor id when the prop is missing', () => {
    const env = installBrowserGlobals();
    init({ locale: 'en', eventsEnabled: true });
    track('page_view'); // ensure visitor id is provisioned
    const vid = getVisitorId();
    expect(vid).toBeTruthy();

    track('signin_success', { method: 'google' });
    // Queue holds two events; flush so we can inspect the body.
    flush();
    const args = env.fetchMock.mock.calls[0];
    if (!args) throw new Error('expected fetch to be called');
    const body = JSON.parse(args[1]?.body as string) as {
      events: Array<{ name: string; props?: Record<string, unknown> }>;
    };
    const signin = body.events.find((e) => e.name === 'signin_success');
    expect(signin?.props?.linked_visitor_id).toBe(vid);
    expect(signin?.props?.method).toBe('google');
  });

  it('does not overwrite an explicit linked_visitor_id', () => {
    const env = installBrowserGlobals();
    init({ locale: 'en', eventsEnabled: true });
    track('signin_success', { method: 'magiclink', linked_visitor_id: 'forced-id' });
    flush();
    const args = env.fetchMock.mock.calls[0];
    if (!args) throw new Error('expected fetch to be called');
    const body = JSON.parse(args[1]?.body as string) as {
      events: Array<{ name: string; props?: Record<string, unknown> }>;
    };
    expect(body.events[0]?.props?.linked_visitor_id).toBe('forced-id');
  });
});

describe('flush triggers', () => {
  it('flushes when queue reaches BATCH_SIZE (10)', () => {
    const env = installBrowserGlobals();
    init({ locale: 'en', eventsEnabled: true });
    for (let i = 0; i < 9; i++) track('page_view');
    expect(env.fetchMock).not.toHaveBeenCalled();
    track('page_view'); // 10th
    expect(env.fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(env.fetchMock.mock.calls[0]?.[1]?.body as string) as {
      events: unknown[];
    };
    expect(body.events).toHaveLength(10);
  });

  it('flushes via timer after 5 seconds', () => {
    const env = installBrowserGlobals();
    init({ locale: 'en', eventsEnabled: true });
    track('page_view');
    expect(env.fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(env.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pagehide flushes via sendBeacon with application/json blob', () => {
    const env = installBrowserGlobals();
    init({ locale: 'en', eventsEnabled: true });
    track('cta_click', { cta: 'install' });
    env.firePageHide();
    expect(env.fetchMock).not.toHaveBeenCalled();
    expect(env.beaconCalls).toHaveLength(1);
    const blob = env.beaconCalls[0]?.body as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
  });

  it('falls back to fetch when navigator.sendBeacon is unavailable', async () => {
    const env = installBrowserGlobals({ noSendBeacon: true });
    init({ locale: 'en', eventsEnabled: true });
    track('cta_click', { cta: 'install' });
    env.firePageHide();
    expect(env.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('swallows fetch errors so telemetry never breaks the page', async () => {
    const env = installBrowserGlobals();
    env.fetchMock.mockRejectedValueOnce(new Error('network down'));
    init({ locale: 'en', eventsEnabled: true });
    track('cta_click', { cta: 'install' });
    expect(() => flush()).not.toThrow();
  });
});

describe('UTM + referrer capture', () => {
  it('captures utm_source / medium / campaign from the URL', () => {
    const env = installBrowserGlobals({
      search: '?utm_source=twitter&utm_medium=social&utm_campaign=launch',
    });
    init({ locale: 'en', eventsEnabled: true });
    track('page_view');
    flush();
    const body = JSON.parse(env.fetchMock.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ utm?: Record<string, string> }>;
    };
    expect(body.events[0]?.utm).toEqual({
      source: 'twitter',
      medium: 'social',
      campaign: 'launch',
    });
  });

  it('captures cross-origin referrer host only, never path or query', () => {
    const env = installBrowserGlobals({ referrer: 'https://news.example.com/path?secret=1' });
    init({ locale: 'en', eventsEnabled: true });
    track('page_view');
    flush();
    const body = JSON.parse(env.fetchMock.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ referrer_host?: string }>;
    };
    expect(body.events[0]?.referrer_host).toBe('news.example.com');
  });

  it('drops same-origin referrers', () => {
    const env = installBrowserGlobals({ referrer: 'https://rewrite.so/try' });
    init({ locale: 'en', eventsEnabled: true });
    track('page_view');
    flush();
    const body = JSON.parse(env.fetchMock.mock.calls[0]?.[1]?.body as string) as {
      events: Array<{ referrer_host?: string }>;
    };
    expect(body.events[0]?.referrer_host).toBeUndefined();
  });
});
