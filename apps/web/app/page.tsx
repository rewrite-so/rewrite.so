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
          双击 Shift。
          <br />
          即时改写。
        </h1>
        <p style={{ marginTop: 20, color: '#555', fontSize: '1.1rem', maxWidth: 640 }}>
          在任何网页的输入框聚焦时按两下 Shift，浮出 3 种风格的 AI 改写候选：贴近原文、口语、正式。
          数字键直接采纳。全键盘，零鼠标，写到一半不离开当下。
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
            网页试用 →
          </Link>
          <Link href="/pricing" style={btnSecondary}>
            查看价格
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
          免费档每月 {QUOTA.loggedInFree} 次（登录用户）/ {QUOTA.anonymousIp}{' '}
          次（匿名访客）。无需信用卡。
        </p>
      </section>

      {/* ===== How it works ===== */}
      <section style={section}>
        <h2 style={h2}>怎么用</h2>
        <div style={grid3}>
          <Step
            num="1"
            title="按 Shift Shift"
            body="在任何网页的输入框（&lt;input&gt; / &lt;textarea&gt; / contenteditable）聚焦时双击 Shift。"
          />
          <Step
            num="2"
            title="3 种风格流式生成"
            body="贴近原文 / 口语 / 正式 三个候选并发生成，逐字流式渲染，几百毫秒首字到达。"
          />
          <Step
            num="3"
            title="按 1 / 2 / 3 采纳"
            body="数字键直接替换；↑↓+Enter 也行；Esc 取消；再次双击 Shift 重生成。"
          />
        </div>
      </section>

      {/* ===== Features ===== */}
      <section style={section}>
        <h2 style={h2}>为什么不一样</h2>
        <div style={grid2}>
          <Feature
            title="不中断心流"
            body="UI 默认隐身。只在输入框聚焦时浮一个 8px 半透明小点。需要时双击 Shift；不需要时它压根不存在。"
          />
          <Feature
            title="完全不存原文"
            body="输入和改写结果只在请求中流过，从不写入数据库、日志、Sentry。我们能给的隐私底线就是不留底。"
          />
          <Feature
            title="跨语种自动翻译"
            body="目标语言可设固定，也可自动检测页面语言。中文 → 英文邮件、英文 → 中文回复都隐式吸收进 rewrite。"
          />
          <Feature
            title="PII 输入框硬排除"
            body="密码、信用卡、CVV、OTP 输入框：不弹小点、不响应触发。这是写在代码里的硬约束，不会因为 PR 简化掉。"
          />
          <Feature
            title="BYOK = 无限"
            body="Pro 用户可填自己的 OpenAI 兼容 base_url + key + model。改写直连你的上游，不计入月配额。"
          />
          <Feature
            title="开源"
            body="代码 100% 开源，可自部署、可审计、可贡献。隐私承诺有源码可对照。"
          />
        </div>
      </section>

      {/* ===== Pricing teaser ===== */}
      <section
        style={{ ...section, background: '#fafafa', borderRadius: 16, padding: '48px 24px' }}
      >
        <h2 style={h2}>简单两档</h2>
        <div style={{ ...grid2, gap: 16 }}>
          <PriceTeaser
            title="Free"
            price="$0"
            sub={`${QUOTA.loggedInFree} 次 / 月（登录用户）`}
            features={['3 种风格', '页面语言自动检测', '不记录原文']}
          />
          <PriceTeaser
            title="Pro"
            price={`$${PRO_PRICE.yearlyMonthly} / 月`}
            sub={`年付 $${PRO_PRICE.yearlyTotal}，省 ${PRO_PRICE.yearlySavingsPercent}%（月付 $${PRO_PRICE.monthly}）`}
            features={[`${QUOTA.pro.toLocaleString()} 次 / 月`, 'BYOK 解锁无限', '优先支持']}
            highlight
          />
        </div>
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Link href="/pricing" style={btnSecondary}>
            完整定价 + FAQ →
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
        <h2 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>试一下，30 秒就能感受到</h2>
        <p style={{ color: '#555', marginTop: 12 }}>
          不用注册，直接进 /try 看 demo。装扩展后任何网站都能用。
        </p>
        <div style={{ marginTop: 24, display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/try" style={btnPrimary}>
            网页试用 →
          </Link>
          <Link href="/login" style={btnSecondary}>
            登录
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
