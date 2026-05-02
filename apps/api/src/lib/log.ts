/**
 * Structured logging — privacy contract enforced.
 *
 * Hard rules (matched by code review, not just convention):
 * 1) Never log input text, rewrite output text, or any user-typed content.
 * 2) Never log raw IP addresses (use the daily-rotating hash).
 * 3) Never log API keys, session tokens, signing secrets.
 * 4) Always emit a single JSON line per event so wrangler tail / logs are
 *    machine-greppable.
 *
 * If you find yourself wanting to log a string that came from the user,
 * log its length instead.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEvent {
  /** Short event name. e.g. 'rewrite.start', 'webhook.invalid_sig', 'quota.exceeded' */
  event: string;
  /** Optional structured fields. Numbers / short enum strings only — never user content. */
  [key: string]: unknown;
}

/**
 * Emit a structured log line.
 *
 * Output format: `[level] event=foo k1=v1 k2=v2 ...` (one line, JSON-safe values).
 */
export function logEvent(level: LogLevel, evt: LogEvent): void {
  const { event, ...fields } = evt;
  const parts: string[] = [`event=${event}`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    parts.push(`${k}=${formatValue(v)}`);
  }
  const line = parts.join(' ');
  if (level === 'error') console.error(`[error] ${line}`);
  else if (level === 'warn') console.warn(`[warn] ${line}`);
  else console.log(`[info] ${line}`);
}

function formatValue(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') {
    // Defense in depth: if anyone accidentally passes a long string, truncate.
    // Real logs should pass numbers/enums, not strings.
    if (v.length > 200) return JSON.stringify(`${v.slice(0, 200)}…`);
    return JSON.stringify(v);
  }
  if (v instanceof Error) {
    // Log only the error class + message + first stack frame, never any nested
    // details that might contain request bodies.
    const stackFirst = v.stack?.split('\n')[1]?.trim() ?? '';
    return JSON.stringify(`${v.name}: ${v.message} | ${stackFirst}`);
  }
  // Object/array: shallow stringify, length-capped.
  try {
    const s = JSON.stringify(v);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return '"[unserializable]"';
  }
}

/**
 * Convenience helpers — use these instead of console.* in route handlers.
 */
export const log = {
  info: (event: string, fields: Record<string, unknown> = {}) =>
    logEvent('info', { event, ...fields }),
  warn: (event: string, fields: Record<string, unknown> = {}) =>
    logEvent('warn', { event, ...fields }),
  error: (event: string, fields: Record<string, unknown> = {}) =>
    logEvent('error', { event, ...fields }),
};
