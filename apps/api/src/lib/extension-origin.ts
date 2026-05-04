import type { Bindings } from '../types.ts';

// Chrome 永远生成全小写扩展 ID（32 字符 a-p）。这里**不带 /i 标志**——
// 配错大小写的 env（如 'ABCDE...'）应当场 reject 而非 silently 归一化为小写后接受，
// 让运维启动时通过 normalize 返 null 看见"配错了"，避免被大小写歧义掩盖。
const EXTENSION_ID_RE = /^[a-p]{32}$/;
const EXTENSION_ORIGIN_RE = /^chrome-extension:\/\/([a-p]{32})$/;

function isLocalApi(env: Pick<Bindings, 'BETTER_AUTH_URL'>): boolean {
  const authUrl = env.BETTER_AUTH_URL ?? '';
  return authUrl.startsWith('http://localhost') || authUrl.startsWith('http://127.0.0.1');
}

function normalizeExtensionOrigin(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  if (EXTENSION_ID_RE.test(trimmed)) return `chrome-extension://${trimmed}`;
  const match = trimmed.match(EXTENSION_ORIGIN_RE);
  if (!match) return null;
  const id = match[1];
  if (!id) return null;
  return `chrome-extension://${id}`;
}

function allowedExtensionOrigins(env: Pick<Bindings, 'EXTENSION_ALLOWED_ORIGINS'>): Set<string> {
  const raw = env.EXTENSION_ALLOWED_ORIGINS ?? '';
  const origins = raw
    .split(',')
    .map(normalizeExtensionOrigin)
    .filter((origin): origin is string => origin !== null);
  return new Set(origins);
}

/**
 * Production trust boundary for extension-origin requests.
 *
 * Chrome sets the `chrome-extension://<id>` Origin header for extension fetches,
 * but any extension has such an origin. Production therefore requires an explicit
 * allowlist. Local wrangler dev allows any extension origin so unpacked builds keep working.
 */
export function isAllowedExtensionOrigin(
  origin: string | undefined | null,
  env: Pick<Bindings, 'BETTER_AUTH_URL' | 'EXTENSION_ALLOWED_ORIGINS'>,
): boolean {
  if (!origin?.startsWith('chrome-extension://')) return false;
  if (isLocalApi(env)) return true;

  const normalized = normalizeExtensionOrigin(origin);
  if (!normalized) return false;
  return allowedExtensionOrigins(env).has(normalized);
}
