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
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  CREEM_API_KEY: string;
  CREEM_WEBHOOK_SECRET: string;
  CREEM_PRO_MONTHLY_PRODUCT_ID: string;
  CREEM_PRO_YEARLY_PRODUCT_ID: string;
  TURNSTILE_SECRET: string;

  // ===== Phase 2 起启用 =====
  // DB: D1Database;
  // KV: KVNamespace;
  // RATE_LIMITER: DurableObjectNamespace;
}

export type AppEnv = {
  Bindings: Bindings;
};
