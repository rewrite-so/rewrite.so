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
      <section style={{ padding: '5rem 1.5rem 3rem', maxWidth: 1080, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
            gap: 48,
            alignItems: 'center',
          }}
        >
          <div>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#666',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                margin: 0,
                marginBottom: 16,
              }}
            >
              Open source · Apache 2.0 · No tracking
            </p>
            <h1
              style={{
                fontSize: '3.25rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              AI rewriting
              <br />
              that doesn’t store your text.
            </h1>
            <p style={{ marginTop: 20, color: '#444', fontSize: '1.05rem', maxWidth: 560 }}>
              Double-tap <Kbd>Shift</Kbd> in any web input box. Three AI rewrites stream in
              parallel. Press <Kbd>1</Kbd> / <Kbd>2</Kbd> / <Kbd>3</Kbd> to accept. Inputs and
              outputs are <strong>never written to disk</strong> — verifiable in the source.
            </p>

            <div
              style={{
                marginTop: 28,
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <Link href="/try" style={btnPrimary}>
                Try it free →
              </Link>
              <a
                href="https://github.com/rewrite-so/rewrite.so"
                style={btnSecondary}
                target="_blank"
                rel="noopener noreferrer"
              >
                ⭐ Star on GitHub
              </a>
            </div>

            <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
              {QUOTA.loggedInFree} free rewrites/month · No card · Bring your own API key for
              unlimited
            </p>
          </div>

          {/* Right: visual placeholder for demo (GIF / video to be added) */}
          <DemoVisual />
        </div>
      </section>

      {/* ===== Privacy spotlight ===== */}
      <section
        style={{
          background: '#0a0a0a',
          color: '#fff',
          padding: '64px 24px',
          marginTop: 24,
        }}
      >
        <div
          style={{
            maxWidth: 920,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 32,
            alignItems: 'center',
          }}
        >
          <div>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#7dd3a8',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                margin: 0,
                marginBottom: 12,
              }}
            >
              The privacy contract
            </p>
            <h2
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                margin: 0,
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
              }}
            >
              Your text is never stored. Period.
            </h2>
            <p style={{ marginTop: 16, color: '#bbb', fontSize: 15, maxWidth: 600 }}>
              Not in databases. Not in logs. Not in error reporters. Not in analytics. The text you
              rewrite passes through the worker once and is gone. We don’t use any third-party APM
              (Sentry, Datadog, etc.) precisely because they’d capture request bodies by default.
              This is not a promise — it’s the architecture, and the source code is open for you to
              verify.
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a
                href="https://github.com/rewrite-so/rewrite.so/blob/main/docs/privacy.md"
                style={{ ...linkLight, fontSize: 14 }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the technical privacy doc →
              </a>
              <a
                href="https://github.com/rewrite-so/rewrite.so/blob/main/apps/api/src/routes/rewrite.ts"
                style={{ ...linkLight, fontSize: 14, color: '#7dd3a8' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                See the rewrite handler source →
              </a>
            </div>
          </div>

          <div
            aria-hidden="true"
            style={{
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: '#7dd3a8',
              background: '#111',
              padding: 16,
              borderRadius: 8,
              border: '1px solid #1f1f1f',
              minWidth: 260,
            }}
          >
            <div style={{ color: '#888', marginBottom: 6 }}># What gets logged</div>
            <div>length=187</div>
            <div>lang=en</div>
            <div>style=faithful</div>
            <div>status=200</div>
            <div style={{ color: '#888', marginTop: 12, marginBottom: 6 }}># What never does</div>
            <div style={{ textDecoration: 'line-through', color: '#7a7a7a' }}>your input text</div>
            <div style={{ textDecoration: 'line-through', color: '#7a7a7a' }}>the rewrites</div>
            <div style={{ textDecoration: 'line-through', color: '#7a7a7a' }}>raw IP</div>
            <div style={{ textDecoration: 'line-through', color: '#7a7a7a' }}>your API key</div>
          </div>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section style={section}>
        <h2 style={h2}>How it works</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
          }}
        >
          <Step
            num="1"
            visual={
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <Kbd large>Shift</Kbd>
                <Kbd large>Shift</Kbd>
              </span>
            }
            title="Double-tap Shift"
            body="Within 500ms, in any focused input on the page — input, textarea, or contenteditable. PII fields (password, CVV, OTP) are hard-excluded."
          />
          <Step
            num="2"
            visual={
              <code
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 12,
                  color: '#666',
                  background: '#fafafa',
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #eee',
                  display: 'inline-block',
                }}
              >
                3 SSE streams
              </code>
            }
            title="3 styles, parallel"
            body="Faithful, casual, formal — generated concurrently in a single multiplexed SSE response. First token in a few hundred milliseconds."
          />
          <Step
            num="3"
            visual={
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <Kbd large>1</Kbd>
                <Kbd large>2</Kbd>
                <Kbd large>3</Kbd>
              </span>
            }
            title="Press to accept"
            body="Number key replaces the input. ↑↓+Enter also works. Esc to dismiss. Double-tap Shift again to regenerate."
          />
        </div>
      </section>

      {/* ===== Features (privacy already extracted to its own section) ===== */}
      <section style={section}>
        <h2 style={h2}>Built for people who care about how it works</h2>
        <div style={grid2}>
          <Feature
            label="OPEN SOURCE"
            title="100% Apache 2.0"
            body={
              <>
                Self-host, audit, fork. The privacy claims above aren’t marketing — they’re code you
                can read at{' '}
                <a
                  href="https://github.com/rewrite-so/rewrite.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkDark}
                >
                  github.com/rewrite-so/rewrite.so
                </a>
                .
              </>
            }
          />
          <Feature
            label="BYOK"
            title="Bring Your Own Key"
            body="Plug in your OpenAI-compatible base URL + key + model. Rewrites go directly to your provider, AES-GCM-encrypted at rest, never logged. Doesn’t count against the monthly quota."
          />
          <Feature
            label="HARD PII EXCLUSION"
            title="Won’t fire in password fields"
            body="Password / cc-* / current-password / new-password / one-time-code / fields with name or id matching password|pin|cvv|cvc|otp|secret|token — all hard-coded to be ignored. Not a setting. Not a feature flag."
          />
          <Feature
            label="STACK"
            title="Cloudflare Workers + D1 + Hono"
            body="Edge-deployed worker, OpenAI Chat Completions wire format, 3-way concurrent fan-out with cascading client-abort. ~5000 lines of TypeScript. Strict mode. No ORM for business tables."
          />
          <Feature
            label="CROSS-LANGUAGE"
            title="Translation is implicit"
            body="Set a fixed target language or auto-detect from the page. Writing English in a Chinese email or Japanese in Slack? Just rewrite — translation happens silently."
          />
          <Feature
            label="KEYBOARD-ONLY"
            title="Never breaks your flow"
            body="UI is invisible by default. Only an 8px translucent dot appears when an input is focused. Need it: double-tap Shift. Don’t need it: it isn’t there."
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
              'BYOK = unlimited',
              'Priority support',
            ]}
            highlight
          />
        </div>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Link href="/pricing" style={btnSecondary}>
            See full pricing & FAQ →
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
            Try it free →
          </Link>
          <Link href="/login" style={btnSecondary}>
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

// ===== Visual placeholder for demo GIF =====
// TODO: replace with actual GIF/video once recorded
function DemoVisual() {
  return (
    <div
      aria-hidden="true"
      style={{
        background: '#fafafa',
        border: '1px solid #e4e4e7',
        borderRadius: 12,
        padding: 24,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        color: '#333',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 6,
          marginBottom: 14,
          paddingBottom: 12,
          borderBottom: '1px solid #eee',
        }}
      >
        <span style={dot('#ef4444')} />
        <span style={dot('#f59e0b')} />
        <span style={dot('#22c55e')} />
        <span style={{ marginLeft: 12, fontSize: 11, color: '#888' }}>any input box</span>
      </div>

      <div style={{ color: '#999', marginBottom: 8 }}># You typed:</div>
      <div style={{ marginBottom: 14, padding: '6px 8px', background: '#fff', borderRadius: 4 }}>
        hi can u help me with the meeting tmr
      </div>

      <div
        style={{ color: '#999', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Kbd small>Shift</Kbd>
        <Kbd small>Shift</Kbd>
        <span style={{ marginLeft: 4 }}>→ 3 streams in, ~200ms first token</span>
      </div>

      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
        <CandidateRow num={1} label="faithful">
          Hi, can you help me with the meeting tomorrow?
        </CandidateRow>
        <CandidateRow num={2} label="casual">
          Hey, can u help me with tmrw’s meeting?
        </CandidateRow>
        <CandidateRow num={3} label="formal">
          Hello, could you assist me with tomorrow’s meeting?
        </CandidateRow>
      </div>

      <div style={{ color: '#999', marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Kbd small>1</Kbd>
        <span>→ accepted, input replaced</span>
      </div>
    </div>
  );
}

function CandidateRow({
  num,
  label,
  children,
}: {
  num: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '6px 8px',
        background: '#fff',
        borderRadius: 4,
        border: '1px solid #f0f0f0',
        alignItems: 'baseline',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: '#a1a1aa',
          minWidth: 16,
          textAlign: 'center',
        }}
      >
        {num}
      </span>
      <span style={{ fontSize: 11, color: '#888', minWidth: 60 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#222' }}>{children}</span>
    </div>
  );
}

function dot(c: string): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: c,
    display: 'inline-block',
  };
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

const linkDark = { color: '#111', fontWeight: 500 };
const linkLight = { color: '#fff', textDecoration: 'underline', textUnderlineOffset: 3 };

const section = {
  maxWidth: 1080,
  margin: '0 auto',
  padding: '56px 24px',
};

const h2 = {
  fontSize: '1.75rem',
  fontWeight: 700,
  letterSpacing: '-0.01em',
  margin: 0,
  marginBottom: 28,
};

const grid2 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 24,
};

function Kbd({
  children,
  large,
  small,
}: {
  children: React.ReactNode;
  large?: boolean;
  small?: boolean;
}) {
  const fontSize = large ? 13 : small ? 11 : 12;
  const padding = large ? '4px 10px' : small ? '1px 6px' : '2px 7px';
  return (
    <kbd
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize,
        padding,
        border: '1px solid #d4d4d8',
        borderBottom: '2px solid #d4d4d8',
        borderRadius: 4,
        background: '#fff',
        color: '#222',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </kbd>
  );
}

function Step({
  num,
  visual,
  title,
  body,
}: {
  num: string;
  visual: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        padding: 24,
        border: '1px solid #e4e4e7',
        borderRadius: 12,
        background: '#fff',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#a1a1aa',
          letterSpacing: '0.06em',
          marginBottom: 16,
        }}
      >
        STEP {num}
      </div>
      <div style={{ marginBottom: 16 }}>{visual}</div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#555', marginTop: 8, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Feature({ label, title, body }: { label: string; title: string; body: React.ReactNode }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: '#888',
          letterSpacing: '0.06em',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 14, color: '#555', marginTop: 6, lineHeight: 1.65 }}>{body}</div>
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
