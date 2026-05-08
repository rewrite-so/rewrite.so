export interface Bindings {
  // ===== Secrets =====
  OPENAI_BASE_URL: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  BYOK_MASTER_KEY: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  /** Web origin（用户浏览的前端地址，dev: http://localhost:3000，prod: https://rewrite.so）。
   *  Magic Link verify 留在 api origin；better-auth 完成后 302 回这个 origin。 */
  WEB_ORIGIN: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  CREEM_API_KEY: string;
  CREEM_WEBHOOK_SECRET: string;
  CREEM_PRO_MONTHLY_PRODUCT_ID: string;
  CREEM_PRO_YEARLY_PRODUCT_ID: string;
  TURNSTILE_SECRET: string;
  EXTENSION_INSTALL_URL?: string;
  /** Comma-separated Chrome extension origins or IDs allowed to use installId quota. */
  EXTENSION_ALLOWED_ORIGINS?: string;

  // ===== Bindings =====
  DB: D1Database;
  KV: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  /**
   * Analytics Engine dataset for /v1/rewrite request-level metrics.
   * Optional in TypeScript so local wrangler dev (without binding) compiles.
   * See lib/metrics.ts for the field contract.
   */
  METRICS?: AnalyticsEngineDataset;
}

/**
 * Subset of better-auth's session.user that route handlers actually consume.
 * Centralised so we can cache it on the Hono context without leaking the
 * full better-auth Session shape.
 */
export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
}

/**
 * Hono context Variables used to share computed-once values across middleware
 * and route handlers within a single request. Currently only sessionUser,
 * which lets ban-check middleware avoid duplicating the better-auth getSession
 * round-trip that route handlers will do anyway.
 *
 * The presence/absence of the key is meaningful:
 * - undefined (key never set): nothing has resolved the session yet
 * - null: session was checked and the request is anonymous
 * - SessionUser: session was checked and the user is known
 *
 * Route handlers should read via getOrResolveSessionUser() (lib/session-cache.ts)
 * to enforce the "check the cache first, fall back to better-auth" pattern.
 */
export interface AppVariables {
  sessionUser?: SessionUser | null;
}

export type AppEnv = {
  Bindings: Bindings;
  Variables: AppVariables;
};
