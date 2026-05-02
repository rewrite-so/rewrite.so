import { PRO_PRICE, QUOTA } from '@rewrite/shared';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        lineHeight: 1.55,
        color: '#111',
      }}
    >
      {/* ===== Hero ===== */}
      <section style={{ padding: '6rem 1.5rem 3rem', maxWidth: 920, margin: '0 auto' }}>
        <h1
          style={{
            fontSize: '3.25rem',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Double-tap Shift.
          <br />
          Instant rewrite.
        </h1>
        <p style={{ marginTop: 20, color: '#555', fontSize: '1.1rem', maxWidth: 640 }}>
          In any web input box, double-tap Shift to summon 3 streaming AI rewrites — faithful,
          casual, formal. Press 1 / 2 / 3 to accept. Keyboard-only. Zero mouse. Never breaks your
          flow.
        </p>

        <div
          style={{
            marginTop: 32,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <Link href="/try" style={btnPrimary}>
            Try it in your browser →
          </Link>
          <Link href="/pricing" style={btnSecondary}>
            Pricing
          </Link>
          <a
            href="https://github.com/rewrite-so/rewrite.so"
            style={btnSecondary}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>

        <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
          Free tier: {QUOTA.loggedInFree} rewrites/month signed-in, {QUOTA.anonymousIp}/month
          anonymous. No card required.
        </p>
      </section>

      {/* ===== How it works ===== */}
      <section style={section}>
        <h2 style={h2}>How it works</h2>
        <div style={grid3}>
          <Step
            num="1"
            title="Tap Shift twice"
            body="Focus any input on the page (input, textarea, or contenteditable), then double-tap Shift within 500ms."
          />
          <Step
            num="2"
            title="3 styles stream in"
            body="Faithful, casual, and formal candidates generate in parallel and stream character by character. First token in a few hundred milliseconds."
          />
          <Step
            num="3"
            title="Press 1 / 2 / 3"
            body="Accept by number key. ↑↓ + Enter also works. Esc to dismiss. Double-tap Shift again to regenerate."
          />
        </div>
      </section>

      {/* ===== Features ===== */}
      <section style={section}>
        <h2 style={h2}>Why it’s different</h2>
        <div style={grid2}>
          <Feature
            title="Never breaks your flow"
            body="UI is invisible by default. Only an 8px translucent dot appears when an input is focused. Need it: double-tap Shift. Don’t need it: it isn’t there."
          />
          <Feature
            title="Your text is never stored"
            body="Inputs and outputs pass through but are never written to a database, log, or APM. Privacy by architecture, not just by promise."
          />
          <Feature
            title="Cross-language, on by default"
            body="Set a fixed target language or auto-detect from the page. Writing English for a Chinese email or Japanese in a Slack thread? Just rewrite — translation is implicit."
          />
          <Feature
            title="Hard PII exclusion"
            body="Password, credit card, CVV, OTP fields: no dot, no trigger, no exception. Hard-coded in the source — not a setting that can be flipped off by a future PR."
          />
          <Feature
            title="BYOK for unlimited"
            body="Pro users plug in their own OpenAI-compatible base URL + key + model. Rewrites go directly to your provider and don’t count against the monthly quota."
          />
          <Feature
            title="Open source"
            body="100% open source. Self-host, audit, contribute. Our privacy claims are verifiable in the code."
          />
        </div>
      </section>

      {/* ===== Pricing teaser ===== */}
      <section
        style={{ ...section, background: '#fafafa', borderRadius: 16, padding: '48px 24px' }}
      >
        <h2 style={h2}>Simple two-tier pricing</h2>
        <div style={{ ...grid2, gap: 16 }}>
          <PriceTeaser
            title="Free"
            price="$0"
            sub={`${QUOTA.loggedInFree} rewrites / month for signed-in users`}
            features={['All 3 styles', 'Auto language detection', 'Inputs never stored']}
          />
          <PriceTeaser
            title="Pro"
            price={`$${PRO_PRICE.yearlyMonthly} / mo`}
            sub={`Billed annually $${PRO_PRICE.yearlyTotal} (save ${PRO_PRICE.yearlySavingsPercent}% vs $${PRO_PRICE.monthly}/mo monthly)`}
            features={[
              `${QUOTA.pro.toLocaleString()} rewrites / month`,
              'BYOK for unlimited',
              'Priority support',
            ]}
            highlight
          />
        </div>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Link href="/pricing" style={btnSecondary}>
            Full pricing + FAQ →
          </Link>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '64px 24px',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Try it. Takes 30 seconds.</h2>
        <p style={{ color: '#555', marginTop: 12 }}>
          No signup. Open <code>/try</code> for the demo. Install the extension to use it on every
          site.
        </p>
        <div style={{ marginTop: 24, display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/try" style={btnPrimary}>
            Try it in your browser →
          </Link>
          <Link href="/login" style={btnSecondary}>
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

// ===== layout helpers =====

const btnPrimary = {
  padding: '12px 22px',
  background: '#111',
  color: '#fff',
  borderRadius: 10,
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: '0.95rem',
};

const btnSecondary = {
  padding: '12px 22px',
  border: '1px solid #d4d4d8',
  borderRadius: 10,
  textDecoration: 'none',
  color: '#111',
  fontWeight: 500,
  fontSize: '0.95rem',
};

const section = {
  maxWidth: 920,
  margin: '0 auto',
  padding: '48px 24px',
};

const h2 = {
  fontSize: '1.75rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  margin: 0,
  marginBottom: 28,
};

const grid3 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 20,
};

const grid2 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 20,
};

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid #e4e4e7',
        borderRadius: 12,
        background: '#fff',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#a1a1aa',
          letterSpacing: '0.04em',
        }}
      >
        STEP {num}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#555', marginTop: 8, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#555', marginTop: 6, lineHeight: 1.65 }}>{body}</div>
    </div>
  );
}

function PriceTeaser({
  title,
  price,
  sub,
  features,
  highlight,
}: {
  title: string;
  price: string;
  sub: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: 20,
        border: highlight ? '2px solid #111' : '1px solid #e4e4e7',
        borderRadius: 12,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 13, color: '#888' }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{price}</div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{sub}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 13, color: '#444', padding: '2px 0' }}>
            ✓ {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
