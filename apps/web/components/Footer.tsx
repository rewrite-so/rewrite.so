import Link from 'next/link';

const COL_HEADING = {
  fontSize: 12,
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  margin: 0,
  marginBottom: 12,
};

const LINK = {
  display: 'block',
  fontSize: 13,
  color: '#444',
  textDecoration: 'none',
  padding: '4px 0',
};

export function Footer() {
  return (
    <footer
      style={{
        marginTop: 80,
        borderTop: '1px solid #e4e4e7',
        background: '#fafafa',
        padding: '40px 24px 32px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 32,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111', marginBottom: 6 }}>
            rewrite.so
          </div>
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.55 }}>
            Double-tap Shift, instant AI rewrite in any input box.
          </div>
        </div>

        <div>
          <h4 style={COL_HEADING}>Product</h4>
          <Link href="/" style={LINK}>
            Home
          </Link>
          <Link href="/try" style={LINK}>
            Try it
          </Link>
          <Link href="/pricing" style={LINK}>
            Pricing
          </Link>
        </div>

        <div>
          <h4 style={COL_HEADING}>Account</h4>
          <Link href="/login" style={LINK}>
            Sign in
          </Link>
          <Link href="/settings" style={LINK}>
            Settings
          </Link>
          <Link href="/billing" style={LINK}>
            Billing
          </Link>
        </div>

        <div>
          <h4 style={COL_HEADING}>Legal</h4>
          <Link href="/terms" style={LINK}>
            Terms of Service
          </Link>
          <Link href="/privacy" style={LINK}>
            Privacy Policy
          </Link>
          <Link href="/refund" style={LINK}>
            Refund Policy
          </Link>
          <Link href="/aup" style={LINK}>
            Acceptable Use
          </Link>
        </div>

        <div>
          <h4 style={COL_HEADING}>Support</h4>
          <Link href="/contact" style={LINK}>
            Contact
          </Link>
          <a href="mailto:hello@rewrite.so" style={LINK}>
            hello@rewrite.so
          </a>
          <a
            href="https://github.com/rewrite-so/rewrite.so"
            style={LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1080,
          margin: '24px auto 0',
          fontSize: 11,
          color: '#999',
          lineHeight: 1.5,
          textAlign: 'center',
        }}
      >
        rewrite.so is an independent product. Not affiliated with, endorsed by, or sponsored by
        OpenAI, Anthropic, Google, or any other AI model provider. Underlying language models are
        accessed via standard OpenAI-compatible APIs.
      </div>

      <div
        style={{
          maxWidth: 1080,
          margin: '20px auto 0',
          paddingTop: 24,
          borderTop: '1px solid #e4e4e7',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          fontSize: 12,
          color: '#888',
        }}
      >
        <span>© {new Date().getFullYear()} rewrite.so. All rights reserved.</span>
        <span>
          Payments processed by{' '}
          <a
            href="https://creem.io"
            style={{ color: '#666', textDecoration: 'none' }}
            target="_blank"
            rel="noopener noreferrer"
          >
            Creem
          </a>
          , our Merchant of Record.
        </span>
      </div>
    </footer>
  );
}
