import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetForTests, initEvents, trackEvent } from './events.ts';

interface SentMessage {
  type: string;
  events: Array<Record<string, unknown>>;
}

const sent: SentMessage[] = [];

beforeEach(() => {
  sent.length = 0;
  vi.useFakeTimers();
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: {
      sendMessage: (msg: SentMessage, cb?: () => void) => {
        sent.push(msg);
        cb?.();
      },
      lastError: undefined,
    },
  };
  __resetForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

const baseInit = {
  installId: 'inst-xyz',
  site: 'reddit' as const,
  locale: 'en',
  eventsEnabled: true,
};

describe('extension events sender', () => {
  it('no-ops before initEvents', () => {
    trackEvent('ext_trigger', { has_selection: 1 });
    vi.runAllTimers();
    expect(sent).toHaveLength(0);
  });

  it('no-ops entirely when eventsEnabled is false (kill switch)', () => {
    initEvents({ ...baseInit, eventsEnabled: false });
    trackEvent('ext_trigger', { has_selection: 1 });
    vi.runAllTimers();
    expect(sent).toHaveLength(0);
  });

  it('flushes after the interval and stamps install_id / site / page / locale', () => {
    initEvents(baseInit);
    trackEvent('ext_accept', { style: 'casual' });
    expect(sent).toHaveLength(0); // debounced, not yet
    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe('events:send');
    expect(sent[0]?.events[0]).toMatchObject({
      name: 'ext_accept',
      page: '/ext',
      locale: 'en',
      install_id: 'inst-xyz',
      site: 'reddit',
      props: { style: 'casual' },
    });
  });

  it('flushes immediately once the batch hits BATCH_SIZE (10)', () => {
    initEvents(baseInit);
    for (let i = 0; i < 10; i++) trackEvent('ext_trigger', { has_selection: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.events).toHaveLength(10);
  });

  it('drops an event with an invalid prop key without sinking later events', () => {
    initEvents(baseInit);
    trackEvent('ext_trigger', { 'Bad-Key': 1 });
    trackEvent('ext_accept', { style: 'formal' });
    vi.advanceTimersByTime(5000);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.events).toHaveLength(1);
    expect(sent[0]?.events[0]?.name).toBe('ext_accept');
  });

  it('never emits a real URL — page is always the /ext sentinel', () => {
    initEvents(baseInit);
    trackEvent('ext_dismiss');
    vi.advanceTimersByTime(5000);
    expect(sent[0]?.events[0]?.page).toBe('/ext');
  });
});
