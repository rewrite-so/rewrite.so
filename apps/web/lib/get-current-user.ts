import { cookies } from 'next/headers';
import { cache } from 'react';

export interface MeUser {
  id: string;
  email: string;
  name?: string | null;
}

/**
 * Reads the session cookie and asks the api for the current user. Used by
 * Server Components (TopNav, Footer, etc.). Wrapped in React.cache so the
 * same request only does one round-trip even if both TopNav and Footer call
 * it — `cache: 'no-store'` on the fetch disables Next's request-dedup, so
 * the React-level memo is what keeps it to one call.
 *
 * - dev: web localhost:3000 → api localhost:8787, cookie shared by host.
 * - prod: web rewrite.so → api api.rewrite.so, session cookie domain
 *   `.rewrite.so` shared across subdomains.
 *
 * Failures (missing cookies, network, api 5xx) return null. Render never
 * blocks on this.
 */
export const getCurrentUser = cache(async (): Promise<MeUser | null> => {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (!cookieHeader) return null;
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:8787';
    const res = await fetch(`${apiBase}/v1/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: MeUser | null };
    return data.user ?? null;
  } catch {
    return null;
  }
});
