export const metadata = {
  title: 'Contact — rewrite.so',
  description: 'How to reach rewrite.so for support, billing, or privacy requests.',
};

export default function ContactPage() {
  return (
    <article>
      <h1 style={{ fontSize: 32, fontWeight: 700, margin: 0 }}>Contact</h1>
      <p style={{ marginTop: 16, color: '#555' }}>
        We&apos;re a small team. Email is the fastest way to reach us; we typically reply within 1–2
        business days.
      </p>

      <div style={{ marginTop: 32, display: 'grid', gap: 16 }}>
        <Card
          heading="Support, sales & everything else"
          body={
            <>
              <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>
                Setup help, account recovery, feature requests, partnership.
              </span>
            </>
          }
        />

        <Card
          heading="Billing & refunds"
          body={
            <>
              <a href="mailto:hello@rewrite.so">hello@rewrite.so</a> with subject{' '}
              <code>Billing</code>
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>
                Refunds within 14 days are no-questions-asked. See our{' '}
                <a href="/refund">Refund Policy</a>.
              </span>
            </>
          }
        />

        <Card
          heading="Privacy & data requests"
          body={
            <>
              <a href="mailto:hello@rewrite.so">hello@rewrite.so</a> with subject{' '}
              <code>Privacy</code>
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>
                Account deletion, data export, GDPR requests. See our{' '}
                <a href="/privacy">Privacy Policy</a>.
              </span>
            </>
          }
        />

        <Card
          heading="Security disclosure"
          body={
            <>
              <a href="mailto:hello@rewrite.so">hello@rewrite.so</a> with subject{' '}
              <code>Security</code>
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>
                Please give us a reasonable window to fix issues before public disclosure.
              </span>
            </>
          }
        />

        <Card
          heading="Source & issues"
          body={
            <>
              <a
                href="https://github.com/rewrite-so/rewrite.so"
                target="_blank"
                rel="noopener noreferrer"
              >
                github.com/rewrite-so/rewrite.so
              </a>
              <br />
              <span style={{ color: '#888', fontSize: 13 }}>
                Bug reports and feature discussions live in GitHub Issues.
              </span>
            </>
          }
        />
      </div>
    </article>
  );
}

function Card({ heading, body }: { heading: string; body: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 20,
        border: '1px solid #e4e4e7',
        borderRadius: 10,
        background: '#fff',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: '#111',
          marginBottom: 8,
        }}
      >
        {heading}
      </div>
      <div style={{ fontSize: 14, color: '#333', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
