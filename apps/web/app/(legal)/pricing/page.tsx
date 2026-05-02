import { PRO_PRICE, QUOTA } from '@rewrite/shared';
import Link from 'next/link';

export const metadata = {
  title: 'Pricing — rewrite.so',
  description:
    'Free for casual use. Pro at $13.99/mo (or $7.99/mo billed annually) for 2,000 rewrites a month plus BYOK.',
};

export default function PricingPage() {
  return (
    <article>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Pricing</h1>
      <p style={{ color: '#555', marginTop: 12, fontSize: 16 }}>
        One free tier for occasional use. One Pro tier for daily writers. No surprise fees.
      </p>

      <div
        style={{
          marginTop: 36,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
        }}
      >
        <PricingCard
          title="Free"
          price="$0"
          period="forever"
          features={[
            `${QUOTA.loggedInFree} rewrites / month for signed-in users`,
            `${QUOTA.anonymousIp} rewrites / month for anonymous web visitors`,
            `${QUOTA.anonymousInstall} rewrites / month for unsigned extension users`,
            'All 3 styles: faithful / casual / formal',
            'Auto-detect page language; pick a fixed target language in settings',
            'No card required',
          ]}
          cta={{ label: 'Try it free', href: '/try' }}
        />

        <PricingCard
          title="Pro"
          highlight
          price={`$${PRO_PRICE.monthly}`}
          period="/ month"
          subPrice={`or $${PRO_PRICE.yearlyMonthly} / month billed annually ($${PRO_PRICE.yearlyTotal} / year, save ${PRO_PRICE.yearlySavingsPercent}%)`}
          features={[
            `${QUOTA.pro.toLocaleString()} rewrites / month`,
            'BYOK: bring your own OpenAI-compatible key for unlimited usage',
            'Priority email support',
            'Cancel anytime; refund within 14 days',
          ]}
          cta={{ label: 'Get Pro →', href: '/billing' }}
        />
      </div>

      <h2 style={H2}>FAQ</h2>

      <Faq
        q="What does &ldquo;rewrite&rdquo; mean here?"
        a="Each time you trigger rewrite.so (double-tap Shift in any input), one request is sent to the model and three style variants stream back. That counts as one rewrite against your quota."
      />

      <Faq
        q="Do you store the text I rewrite?"
        a={
          <>
            No. Inputs and outputs pass through but are never persisted — not in application logs,
            not in error reporters, not in analytics. See our <a href="/privacy">Privacy Policy</a>{' '}
            for details.
          </>
        }
      />

      <Faq
        q="What is BYOK?"
        a="Pro users can configure a custom OpenAI-compatible base URL, model, and API key. When enabled, your text goes directly to your chosen provider (you pay them, not us), and the rewrites do not count against your monthly quota — only short-term abuse limits remain."
      />

      <Faq
        q="What happens if I exceed my quota?"
        a="The next request returns a 429 with a clear &lsquo;quota exceeded&rsquo; message. Quotas reset at 00:00 UTC on the first day of each month. You can upgrade or set up BYOK at any time."
      />

      <Faq
        q="Can I cancel?"
        a={
          <>
            Yes, anytime, from <Link href="/settings">your settings</Link> via the &ldquo;Manage
            subscription&rdquo; portal. You keep Pro access until the end of the current billing
            period. Refund within 14 days of first charge — see <a href="/refund">Refund Policy</a>.
          </>
        }
      />

      <Faq
        q="Who handles the payment?"
        a={
          <>
            <a href="https://creem.io" target="_blank" rel="noopener noreferrer">
              Creem
            </a>{' '}
            is our Merchant of Record. They process payments, taxes, and refunds on our behalf. Your
            card details never touch our servers.
          </>
        }
      />
    </article>
  );
}

function PricingCard({
  title,
  price,
  period,
  subPrice,
  features,
  cta,
  highlight,
}: {
  title: string;
  price: string;
  period: string;
  subPrice?: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: 24,
        border: highlight ? '2px solid #111' : '1px solid #e4e4e7',
        borderRadius: 12,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 32, fontWeight: 700 }}>{price}</span>
        <span style={{ fontSize: 13, color: '#888' }}>{period}</span>
      </div>
      {subPrice && <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{subPrice}</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0', flex: 1 }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 13, color: '#444', padding: '4px 0' }}>
            ✓ {f}
          </li>
        ))}
      </ul>
      <Link
        href={cta.href}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: highlight ? '#111' : '#f4f4f5',
          color: highlight ? '#fff' : '#111',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          textDecoration: 'none',
          textAlign: 'center',
          display: 'block',
        }}
      >
        {cta.label}
      </Link>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{q}</h3>
      <p style={{ color: '#555', marginTop: 6 }}>{a}</p>
    </div>
  );
}

const H2 = {
  fontSize: 22,
  fontWeight: 600,
  marginTop: 56,
  marginBottom: 12,
};
