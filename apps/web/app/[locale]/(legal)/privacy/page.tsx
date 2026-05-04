import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { localizedMetadata } from '../../../metadata.ts';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.privacy' });
  return localizedMetadata(locale, '/privacy', { title: t('title') });
}

export default function PrivacyPage() {
  return (
    <article>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Privacy Policy</h1>
      <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>Last updated: May 2, 2026</p>

      <p style={{ marginTop: 28 }}>
        rewrite.so (&ldquo;we&rdquo;, &ldquo;us&rdquo;, the &ldquo;Service&rdquo;) is built around a
        single privacy commitment:{' '}
        <strong>we never store the text you rewrite or the rewrites we produce.</strong> This page
        explains exactly what we collect, what we don&apos;t, and how to reach us about your data.
      </p>

      <h2 style={H2}>What we never collect</h2>
      <ul style={UL}>
        <li>
          The text you submit for rewriting. Your input is streamed to the upstream language model
          and the response is streamed back to you. We do not log or persist either side of that
          exchange — not in application logs, not in error reporters, not in analytics.
        </li>
        <li>
          The candidate rewrites returned to you. Same as above — they pass through but are never
          written to disk.
        </li>
        <li>
          Browser history, autofill, saved passwords, or content of pages other than the input you
          actively trigger the rewrite on.
        </li>
      </ul>

      <h2 style={H2}>What we do collect</h2>
      <ul style={UL}>
        <li>
          <strong>Account data.</strong> Your email address (for sign-in via magic link) and your
          user preferences (target language, UI locale).
        </li>
        <li>
          <strong>Usage counters.</strong> Per-month rewrite counts for quota enforcement. We store
          the count, the month, and an anonymized subject identifier — never the content. For
          anonymous visitors the subject is a daily-rotated hash of your IP address (we cannot
          reverse it back to your IP after the day rotates). For extension users it is a random
          installId stored in your browser&apos;s local storage. For signed-in users it is your
          account ID.
        </li>
        <li>
          <strong>Subscription &amp; payment metadata.</strong> If you subscribe to Pro, Creem (our
          payment processor and Merchant of Record) handles your card data; we only store the
          resulting subscription status, plan, billing period, and Creem customer/subscription IDs.
          We never see, store, or have access to your card number.
        </li>
        <li>
          <strong>Bring-Your-Own-Key (BYOK) configuration.</strong> If you enable BYOK, the base URL
          and model name you configured, plus your API key encrypted at rest with AES-GCM-256. The
          key is never logged in plaintext and never returned in API responses (only the last four
          characters are shown back to you for confirmation).
        </li>
        <li>
          <strong>Operational logs.</strong> Request length (in characters), detected language,
          requested style, response status code, and your account ID or anonymized subject. These
          are needed for debugging, abuse prevention, and quota enforcement.
        </li>
      </ul>

      <h2 style={H2}>Third parties we share data with</h2>
      <ul style={UL}>
        <li>
          <strong>Cloudflare</strong> — hosts our Workers, D1 database, KV cache, and edge network.
          Your data is stored in Cloudflare&apos;s infrastructure subject to their terms.
        </li>
        <li>
          <strong>OpenAI-compatible language model provider</strong> — receives your input text in
          real time to produce the rewrite, then forgets it (subject to that provider&apos;s data
          retention policy). If you enable BYOK, your text goes to the provider you specified
          instead of ours.
        </li>
        <li>
          <strong>Creem</strong> — payment processor and Merchant of Record. Receives your card and
          billing details when you subscribe. See{' '}
          <a href="https://creem.io" target="_blank" rel="noopener noreferrer">
            creem.io
          </a>{' '}
          for their privacy practices.
        </li>
        <li>
          <strong>Resend</strong> — sends transactional emails (login links, billing notifications).
          Receives your email address.
        </li>
      </ul>
      <p>
        We do not sell your data. We do not run third-party advertising or behavioral analytics.
      </p>

      <h2 style={H2}>Cookies</h2>
      <p>
        We use one essential cookie: the session cookie set when you sign in. It is scoped to{' '}
        <code>.rewrite.so</code> so the browser extension and the website share authentication. We
        do not use tracking cookies or third-party advertising cookies.
      </p>

      <h2 style={H2}>Data retention</h2>
      <ul style={UL}>
        <li>
          Account data and BYOK configuration: kept until you delete your account or remove the BYOK
          key.
        </li>
        <li>
          Usage counters: kept for the current month plus 12 months of historical aggregates, then
          permanently deleted.
        </li>
        <li>
          Subscription records: kept while your subscription is active and for 7 years after
          termination, as required by tax law in our payment processor&apos;s jurisdiction.
        </li>
        <li>Operational logs: retained for at most 30 days, then permanently deleted.</li>
      </ul>

      <h2 style={H2}>Your rights</h2>
      <p>Regardless of where you live, you may at any time:</p>
      <ul style={UL}>
        <li>Request a copy of the data we hold about you.</li>
        <li>Request correction of any inaccurate data.</li>
        <li>
          Request permanent deletion of your account and all associated data (subject to legal
          retention obligations on subscription/payment records).
        </li>
        <li>Withdraw consent for marketing communications (we don&apos;t send any anyway).</li>
      </ul>
      <p>
        To exercise any of these rights, email{' '}
        <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>. We respond within 30 days.
      </p>

      <h2 style={H2}>Children</h2>
      <p>
        rewrite.so is not directed at children under 16. If you believe a child has provided us with
        personal data, contact us and we will delete it.
      </p>

      <h2 style={H2}>Changes</h2>
      <p>
        We may update this policy. Material changes will be announced in-product or by email. The
        &ldquo;Last updated&rdquo; date at the top reflects the latest revision.
      </p>

      <h2 style={H2}>Contact</h2>
      <p>
        Questions about this policy: <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>.
      </p>
    </article>
  );
}

const H2 = {
  fontSize: 20,
  fontWeight: 600,
  marginTop: 40,
  marginBottom: 12,
};

const UL = {
  paddingLeft: 22,
  margin: '8px 0 16px',
};
