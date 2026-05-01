import Link from 'next/link';

export default function HomePage() {
  return (
    <main
      style={{
        padding: '6rem 1.5rem 4rem',
        maxWidth: '720px',
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        lineHeight: 1.55,
      }}
    >
      <h1 style={{ fontSize: '3rem', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>
        双击 Shift。
        <br />
        即时改写。
      </h1>
      <p style={{ marginTop: '1.25rem', color: '#555', fontSize: '1.05rem' }}>
        在任何网页输入框，按两下 Shift 即可获得 3 种风格的 AI 改写：贴近原文、口语、正式。
        全键盘操作，用完即走。
      </p>
      <div style={{ marginTop: '2.5rem', display: 'flex', gap: '12px' }}>
        <Link
          href="/try"
          style={{
            padding: '12px 20px',
            background: '#111',
            color: '#fff',
            borderRadius: 10,
            textDecoration: 'none',
            fontWeight: 500,
            fontSize: '0.95rem',
          }}
        >
          网页试用 →
        </Link>
        <a
          href="https://github.com/rewrite-so/rewrite.so"
          style={{
            padding: '12px 20px',
            border: '1px solid #d4d4d8',
            borderRadius: 10,
            textDecoration: 'none',
            color: '#111',
            fontWeight: 500,
            fontSize: '0.95rem',
          }}
        >
          GitHub
        </a>
      </div>
    </main>
  );
}
