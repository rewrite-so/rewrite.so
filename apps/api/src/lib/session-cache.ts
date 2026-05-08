/**
 * Session user cache for a single request lifecycle.
 *
 * Why this exists: ban-check middleware runs before /v1/rewrite, /v1/me/*,
 * /v1/billing/* and calls better-auth's getSession() to know whether to apply
 * a ban. Route handlers then call getSession() *again* themselves. Each call
 * is a D1 round-trip (sessions table SELECT), so logged-in requests pay the
 * cost twice. Sharing the resolved user object via Hono's c.var collapses it
 * to one round-trip.
 *
 * Anonymous requests still pay one getSession() — there's nothing to share —
 * but they don't double-pay either.
 */
import type { Context } from 'hono';
import type { AppEnv, SessionUser } from '../types.ts';
import { createAuth } from './auth.ts';

/**
 * Resolve the current request's session user, returning a cached value if a
 * previous middleware has already done the work. Sets c.var.sessionUser on
 * miss so subsequent callers in the same request see the cached value
 * (including null for confirmed-anonymous).
 */
export async function getOrResolveSessionUser(c: Context<AppEnv>): Promise<SessionUser | null> {
  const cached = c.get('sessionUser');
  if (cached !== undefined) return cached;

  let user: SessionUser | null = null;
  try {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        image: session.user.image ?? null,
      };
    }
  } catch {
    user = null;
  }
  c.set('sessionUser', user);
  return user;
}

/**
 * Convenience for callers that only need the userId — equivalent to
 * `(await getOrResolveSessionUser(c))?.id ?? null` but slightly more
 * readable at call sites.
 */
export async function getOrResolveUserId(c: Context<AppEnv>): Promise<string | null> {
  const user = await getOrResolveSessionUser(c);
  return user?.id ?? null;
}
