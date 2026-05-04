interface TurnstileSiteverifyResponse {
  success?: boolean;
}

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verifies a Turnstile token for anonymous web /try requests.
 *
 * Fail-closed when a secret is configured. If TURNSTILE_SECRET is absent in
 * local/dev environments, the check is disabled so extension and local API
 * smoke tests do not need Cloudflare credentials.
 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;

  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) form.set('remoteip', remoteIp);

  try {
    const res = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TurnstileSiteverifyResponse;
    return data.success === true;
  } catch {
    return false;
  }
}
