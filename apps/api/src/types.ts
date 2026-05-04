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

  // ===== Bindings =====
  DB: D1Database;
  KV: KVNamespace;
  RATE_LIMITER: DurableObjectNamespace;
}

export type AppEnv = {
  Bindings: Bindings;
};
