import { PRO_PRICE, QUOTA } from '@rewrite/shared';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '../../i18n/navigation.ts';

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');

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
              {t('hero.eyebrow')}
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
              {t('hero.h1Line1')}
              <br />
              {t('hero.h1Line2')}
            </h1>
            <p
              style={{
                marginTop: 14,
                color: '#222',
                fontSize: '1.25rem',
                fontWeight: 500,
                maxWidth: 560,
                lineHeight: 1.4,
              }}
            >
              {t('hero.subHeadline')}
            </p>
            <div style={{ marginTop: 12 }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  background: '#f4f4f5',
                  border: '1px solid #e4e4e7',
                  borderRadius: 999,
                  fontSize: '0.85rem',
                  color: '#555',
                  fontWeight: 500,
                }}
              >
                🌐 {t('hero.polyglot')}
              </span>
            </div>
            <p style={{ marginTop: 20, color: '#444', fontSize: '1.05rem', maxWidth: 560 }}>
              {t.rich('hero.intro', {
                kbd: (chunks) => <Kbd>{chunks}</Kbd>,
              })}
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
                {t('hero.ctaPrimary')}
              </Link>
              <a
                href="https://github.com/rewrite-so/rewrite.so"
                style={btnSecondary}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('hero.ctaSecondary')}
              </a>
            </div>

            <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
              {t('hero.fineprint', { count: QUOTA.loggedInFree })}
            </p>
          </div>

          {/* Right: visual placeholder for demo (GIF / video to be added) */}
          <DemoVisual
            anyInput={t('demo.anyInput')}
            youTyped={t('demo.youTyped')}
            streams={t('demo.streams')}
            accepted={t('demo.accepted')}
          />
        </div>
      </section>

      {/* ===== Sound familiar? — 痛点卡 → 场景卡（双卡片对比布局） ===== */}
      <section style={{ maxWidth: 800, margin: '0 auto', padding: '72px 24px 48px' }}>
        <h2
          style={{
            fontSize: '1.875rem',
            fontWeight: 700,
            margin: 0,
            marginBottom: 14,
            letterSpacing: '-0.01em',
          }}
        >
          {t('scenarios.h2')}
        </h2>

        {/* intro 过渡段：把 hero "自信发" 上扬情绪过渡到"承认这事确实费心" */}
        <p
          style={{
            color: '#555',
            fontSize: '1rem',
            lineHeight: 1.65,
            margin: 0,
            marginBottom: 32,
            maxWidth: 640,
          }}
        >
          {t('scenarios.intro')}
        </p>

        {/* Pain card — 灰底，"诊断"语气 */}
        <div
          style={{
            padding: '24px 28px',
            background: '#fafafa',
            border: '1px solid #e4e4e7',
            borderRadius: 14,
          }}
        >
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {(['pain1', 'pain2', 'pain3', 'pain4'] as const).map((k) => (
              <li
                key={k}
                style={{
                  fontSize: '0.975rem',
                  color: '#444',
                  lineHeight: 1.6,
                  paddingLeft: 22,
                  position: 'relative',
                }}
              >
                <span style={{ position: 'absolute', left: 0, color: '#999' }}>→</span>
                {t(`scenarios.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        {/* Bridge — 两卡之间的转折，加粗收紧视觉节奏 */}
        <p
          style={{
            color: '#16a34a',
            fontSize: '0.95rem',
            fontWeight: 600,
            letterSpacing: '0.01em',
            margin: 0,
            marginTop: 28,
            marginBottom: 14,
          }}
        >
          {t('scenarios.bridge')}
        </p>

        {/* Use case card — 浅绿底，"建议"正向 */}
        <div
          style={{
            padding: '24px 28px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 14,
          }}
        >
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {(['useCase1', 'useCase2', 'useCase3', 'useCase4'] as const).map((k) => (
              <li
                key={k}
                style={{
                  fontSize: '0.975rem',
                  color: '#222',
                  fontWeight: 500,
                  lineHeight: 1.6,
                  paddingLeft: 22,
                  position: 'relative',
                }}
              >
                <span style={{ position: 'absolute', left: 0, color: '#16a34a' }}>✓</span>
                {t(`scenarios.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        <p
          style={{
            marginTop: 32,
            color: '#666',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          {t('scenarios.outro')}
        </p>
      </section>

      {/* ===== How it works ===== */}
      <section style={section}>
        <h2 style={h2}>{t('howItWorks.h2')}</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 20,
          }}
        >
          <Step
            stepLabel={t('howItWorks.stepLabel', { num: '1' })}
            visual={
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <Kbd large>Shift</Kbd>
                <Kbd large>Shift</Kbd>
              </span>
            }
            title={t('howItWorks.step1.title')}
            body={t('howItWorks.step1.body')}
          />
          <Step
            stepLabel={t('howItWorks.stepLabel', { num: '2' })}
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
            title={t('howItWorks.step2.title')}
            body={t('howItWorks.step2.body')}
          />
          <Step
            stepLabel={t('howItWorks.stepLabel', { num: '3' })}
            visual={
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <Kbd large>1</Kbd>
                <Kbd large>2</Kbd>
                <Kbd large>3</Kbd>
              </span>
            }
            title={t('howItWorks.step3.title')}
            body={t('howItWorks.step3.body')}
          />
        </div>
      </section>

      {/* ===== Features ===== */}
      <section style={section}>
        <h2 style={h2}>{t('features.h2')}</h2>
        <div style={grid2}>
          <Feature
            label={t('features.keyboard.label')}
            title={t('features.keyboard.title')}
            body={t('features.keyboard.body')}
          />
          <Feature
            label={t('features.crossLang.label')}
            title={t('features.crossLang.title')}
            body={t('features.crossLang.body')}
          />
          <Feature
            label={t('features.byok.label')}
            title={t('features.byok.title')}
            body={t('features.byok.body')}
          />
          <Feature
            label={t('features.pii.label')}
            title={t('features.pii.title')}
            body={t('features.pii.body')}
          />
          <Feature
            label={t('features.stack.label')}
            title={t('features.stack.title')}
            body={t('features.stack.body')}
          />
          <Feature
            label={t('features.openSource.label')}
            title={t('features.openSource.title')}
            body={t.rich('features.openSource.body', {
              repo: (chunks) => (
                <a
                  href="https://github.com/rewrite-so/rewrite.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkDark}
                >
                  {chunks}
                </a>
              ),
            })}
          />
        </div>
      </section>

      {/* ===== Privacy spotlight (从 hero 后下移到此处) ===== */}
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
              {t('privacy.eyebrow')}
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
              {t('privacy.h2')}
            </h2>
            <p style={{ marginTop: 16, color: '#bbb', fontSize: 15, maxWidth: 600 }}>
              {t('privacy.body')}
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <a
                href="https://github.com/rewrite-so/rewrite.so/blob/main/docs/privacy.md"
                style={{ ...linkLight, fontSize: 14 }}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('privacy.linkDoc')}
              </a>
              <a
                href="https://github.com/rewrite-so/rewrite.so/blob/main/apps/api/src/routes/rewrite.ts"
                style={{ ...linkLight, fontSize: 14, color: '#7dd3a8' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('privacy.linkSource')}
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
            <div style={{ color: '#888', marginBottom: 6 }}>{t('privacy.logTitle')}</div>
            <div>length=187</div>
            <div>lang=en</div>
            <div>style=faithful</div>
            <div>status=200</div>
            <div style={{ color: '#888', marginTop: 12, marginBottom: 6 }}>
              {t('privacy.notLoggedTitle')}
            </div>
            <div style={{ textDecoration: 'line-through', color: '#7a7a7a' }}>
              {t('privacy.redacted.input')}
            </div>
            <div style={{ textDecoration: 'line-through', color: '#7a7a7a' }}>
              {t('privacy.redacted.rewrites')}
            </div>
            <div style={{ textDecoration: 'line-through', color: '#7a7a7a' }}>
              {t('privacy.redacted.rawIp')}
            </div>
            <div style={{ textDecoration: 'line-through', color: '#7a7a7a' }}>
              {t('privacy.redacted.apiKey')}
            </div>
          </div>
        </div>
      </section>

      {/* ===== Pricing teaser ===== */}
      <section
        style={{ ...section, background: '#fafafa', borderRadius: 16, padding: '48px 24px' }}
      >
        <h2 style={h2}>{t('pricing.h2')}</h2>
        <div style={{ ...grid2, gap: 16 }}>
          <PriceTeaser
            title={t('pricing.free.title')}
            price={t('pricing.free.price')}
            sub={t('pricing.free.sub', { count: QUOTA.loggedInFree })}
            features={[t('pricing.free.feat1'), t('pricing.free.feat2'), t('pricing.free.feat3')]}
          />
          <PriceTeaser
            title={t('pricing.pro.title')}
            price={t('pricing.pro.price', { monthly: PRO_PRICE.yearlyMonthly })}
            sub={t('pricing.pro.sub', {
              total: PRO_PRICE.yearlyTotal,
              percent: PRO_PRICE.yearlySavingsPercent,
              monthlyAlt: PRO_PRICE.monthly,
            })}
            features={[
              t('pricing.pro.feat1', { count: QUOTA.pro }),
              t('pricing.pro.feat2'),
              t('pricing.pro.feat3'),
            ]}
            highlight
          />
        </div>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Link href="/pricing" style={btnSecondary}>
            {t('pricing.ctaSeeFull')}
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
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{t('finalCta.h2')}</h2>
        <p style={{ color: '#555', marginTop: 12 }}>
          {t.rich('finalCta.body', {
            code: (chunks) => (
              <code
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  background: '#f4f4f5',
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                {chunks}
              </code>
            ),
          })}
        </p>
        <div style={{ marginTop: 24, display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/try" style={btnPrimary}>
            {t('finalCta.primary')}
          </Link>
          <Link href="/login" style={btnSecondary}>
            {t('finalCta.secondary')}
          </Link>
        </div>
      </section>
    </main>
  );
}

function DemoVisual({
  anyInput,
  youTyped,
  streams,
  accepted,
}: {
  anyInput: string;
  youTyped: string;
  streams: string;
  accepted: string;
}) {
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
        <span style={{ marginLeft: 12, fontSize: 11, color: '#888' }}>{anyInput}</span>
      </div>

      <div style={{ color: '#999', marginBottom: 8 }}>{youTyped}</div>
      <div style={{ marginBottom: 14, padding: '6px 8px', background: '#fff', borderRadius: 4 }}>
        hi can u help me with the meeting tmr
      </div>

      <div
        style={{ color: '#999', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Kbd small>Shift</Kbd>
        <Kbd small>Shift</Kbd>
        <span style={{ marginLeft: 4 }}>{streams}</span>
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
        <span>{accepted}</span>
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
  stepLabel,
  visual,
  title,
  body,
}: {
  stepLabel: string;
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
        {stepLabel}
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
