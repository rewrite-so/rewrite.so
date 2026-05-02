import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log, logEvent } from './log.ts';

describe('logEvent', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;
  let consoleWarn: ReturnType<typeof vi.spyOn>;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });

  it('emits info to console.log with [info] prefix', () => {
    log.info('foo', { a: 1 });
    expect(consoleLog).toHaveBeenCalledWith('[info] event=foo a=1');
  });

  it('emits warn to console.warn', () => {
    log.warn('bar', { code: 'x' });
    expect(consoleWarn).toHaveBeenCalledWith('[warn] event=bar code="x"');
  });

  it('emits error to console.error', () => {
    log.error('boom');
    expect(consoleError).toHaveBeenCalledWith('[error] event=boom');
  });

  it('formats numbers, booleans without quotes', () => {
    logEvent('info', { event: 't', n: 42, b: true });
    expect(consoleLog).toHaveBeenCalledWith('[info] event=t n=42 b=true');
  });

  it('strings get JSON-quoted', () => {
    logEvent('info', { event: 't', s: 'hello' });
    expect(consoleLog).toHaveBeenCalledWith('[info] event=t s="hello"');
  });

  it('truncates long strings (defense in depth)', () => {
    const long = 'a'.repeat(500);
    logEvent('info', { event: 't', big: long });
    const out = consoleLog.mock.calls[0]?.[0] as string;
    expect(out.length).toBeLessThan(250);
    expect(out).toContain('…');
  });

  it('Errors are logged as class+message+first stack frame, not full nested', () => {
    const e = new TypeError('oops');
    logEvent('error', { event: 't', err: e });
    const out = consoleError.mock.calls[0]?.[0] as string;
    expect(out).toContain('TypeError');
    expect(out).toContain('oops');
  });

  it('skips undefined fields', () => {
    logEvent('info', { event: 't', a: 1, b: undefined });
    expect(consoleLog).toHaveBeenCalledWith('[info] event=t a=1');
  });
});
