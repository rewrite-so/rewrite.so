import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { localizedMetadata } from '../../../metadata.ts';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta.refund' });
  return localizedMetadata(locale, '/refund', { title: t('title') });
}

export default function RefundPage() {
  return (
    <article>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Refund Policy</h1>
      <p style={{ color: '#888', fontSize: 13, marginTop: 8 }}>Last updated: May 2, 2026</p>

      <p style={{ marginTop: 28 }}>
        We want you to be satisfied with rewrite.so Pro. If it&apos;s not the right fit, you can
        cancel any time and request a refund within the windows below.
      </p>

      <h2 style={H2}>14-day refund window (new subscribers)</h2>
      <p>
        For your <strong>first paid subscription period</strong> (whether monthly or annual), you
        can request a full refund within <strong>14 days of the initial charge</strong> for any
        reason. We don&apos;t ask why; one email is enough.
      </p>

      <h2 style={H2}>Annual subscriptions, after the first 14 days</h2>
      <p>
        If you cancel an annual plan after the 14-day window, your subscription remains active until
        the end of the current billing period and does not auto-renew. Refunds for the unused
        portion of an annual plan are considered case by case for documented service outages or
        material adverse changes; outside those situations, the annual upfront payment is
        non-refundable beyond day 14.
      </p>

      <h2 style={H2}>Monthly subscriptions, after the first 14 days</h2>
      <p>
        If you cancel a monthly plan after day 14, you keep Pro access until the end of the current
        billing month and are not charged again. Past monthly charges are not refunded.
      </p>

      <h2 style={H2}>How to request a refund</h2>
      <ol style={UL}>
        <li>
          Cancel your subscription via the &ldquo;Manage subscription&rdquo; link in your rewrite.so
          settings (this opens our payment processor&apos;s self-serve portal), <em>or</em> from the
          email receipt Creem sent you at signup.
        </li>
        <li>
          Email <a href="mailto:hello@rewrite.so">hello@rewrite.so</a> from the email address on
          your subscription, with the subject line <code>Refund request</code> and your Creem order
          number (it&apos;s on your receipt).
        </li>
        <li>
          We confirm eligibility within 2 business days and Creem (our Merchant of Record) processes
          the refund to your original payment method. Refunds typically appear within 5–10 business
          days depending on your bank.
        </li>
      </ol>

      <h2 style={H2}>Chargebacks</h2>
      <p>
        Please email us before initiating a chargeback with your bank. We almost always resolve
        refund requests faster than chargebacks, and chargebacks may result in permanent suspension
        of your account per our <a href="/terms">Terms</a>.
      </p>

      <h2 style={H2}>Free tier and BYOK</h2>
      <p>
        The Free tier is, well, free — there&apos;s nothing to refund. If you use BYOK (Bring Your
        Own Key), you are billed directly by your chosen API provider; we do not receive or refund
        those charges.
      </p>

      <h2 style={H2}>Contact</h2>
      <p>
        Refund or billing questions: <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>.
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
