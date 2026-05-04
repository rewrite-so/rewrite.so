import { useEffect, useState } from 'preact/hooks';
import { WEB_BASE } from '../lib/config.ts';
import { useT, useUiLocale } from '../lib/i18n.ts';
import { getOrCreateInstallId } from '../lib/storage.ts';

interface Usage {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  tier: 'anonymous' | 'anonymous_install' | 'free' | 'pro';
}

export function App() {
  const t = useT();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const installId = await getOrCreateInstallId();
        // 走 background SW 代理：popup 直接 fetch 拿不到 better-auth session cookie
        // （SameSite=Lax 不跨站走子资源请求），SW 在 host_permissions 上下文里能正确带 cookie。
        const res = await new Promise<{ ok: true; data: Usage } | { ok: false; error: string }>(
          (resolve) => {
            chrome.runtime.sendMessage(
              { type: 'me-usage:get', installId },
              (response: { ok: true; data: Usage } | { ok: false; error: string } | undefined) => {
                if (chrome.runtime.lastError) {
                  resolve({ ok: false, error: chrome.runtime.lastError.message ?? 'sw_error' });
                  return;
                }
                resolve(response ?? { ok: false, error: 'no_response' });
              },
            );
          },
        );
        if (cancelled) return;
        if (!res.ok) throw new Error(res.error);
        setUsage(res.data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ width: 280, padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>rewrite.so</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>{t('ext.popup.tagline')}</p>
      </header>

      <div style={cardStyle}>
        {error ? (
          <div style={{ fontSize: 12, color: '#dc2626' }}>
            {t('ext.popup.usageError')} {error}
          </div>
        ) : usage ? (
          <UsageDisplay usage={usage} />
        ) : (
          <div style={{ fontSize: 12, color: '#888' }}>{t('ext.popup.loading')}</div>
        )}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button type="button" style={btnStyle} onClick={() => chrome.runtime.openOptionsPage()}>
          {t('ext.popup.settings')}
        </button>
        <button
          type="button"
          style={btnPrimaryStyle}
          onClick={() =>
            chrome.tabs.create({
              url:
                usage?.tier === 'free' || usage?.tier === 'pro'
                  ? `${WEB_BASE}/settings`
                  : `${WEB_BASE}/login`,
            })
          }
        >
          {usage?.tier === 'free' || usage?.tier === 'pro'
            ? t('ext.popup.myAccount')
            : t('ext.popup.signIn')}
        </button>
      </div>

      <FeedbackLink />
    </div>
  );
}

/**
 * 翻译反馈入口：以前没渠道收集 i18n 错译反馈（zh-TW 是否要拆出 / ja-ko-es-fr-de
 * 是 LLM 翻译初稿待母语校对）。这里加一行小字链接，mailto 预填 subject + locale，
 * 让用户点一下就能给我们写邮件。空间小、噪音小、用户主动行为。
 */
function FeedbackLink() {
  const t = useT();
  const locale = useUiLocale();
  const subject = encodeURIComponent(`Translation feedback (${locale})`);
  const body = encodeURIComponent(
    `Locale: ${locale}\nExtension version: ${chrome.runtime.getManifest().version}\n\n[Describe what's wrong]`,
  );
  const href = `mailto:hello@rewrite.so?subject=${subject}&body=${body}`;
  return (
    <div style={{ marginTop: 10, textAlign: 'center', fontSize: 11 }}>
      <a
        href={href}
        target="_blank"
        rel="noopener"
        style={{
          color: '#999',
          textDecoration: 'none',
          borderBottom: '1px solid transparent',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = '#999';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.borderBottomColor = 'transparent';
        }}
      >
        {t('ext.popup.reportTranslation')}
      </a>
    </div>
  );
}

function UsageDisplay({ usage }: { usage: Usage }) {
  const t = useT();
  const locale = useUiLocale();
  const reset = new Date(usage.resetAt);
  const resetLabel = reset.toLocaleDateString(locale, { month: 'long', day: 'numeric' });
  const isLow = usage.remaining <= Math.max(1, Math.floor(usage.limit * 0.2));
  const totalLabel = Number.isFinite(usage.limit) ? usage.limit : '∞';
  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 11, color: '#888' }}>{t('ext.popup.remainingThisMonth')}</span>
        <span style={{ fontSize: 11, color: '#888' }}>{t(`ext.popup.tier.${usage.tier}`)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: isLow ? '#dc2626' : '#111' }}>
          {Number.isFinite(usage.remaining) ? usage.remaining : '∞'}
        </span>
        <span style={{ fontSize: 12, color: '#888' }}>/ {totalLabel}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: '#999' }}>
        {t('ext.popup.resetsOn').replace('{date}', resetLabel)}
      </div>
    </>
  );
}

const cardStyle = {
  padding: '10px 12px',
  border: '1px solid #e4e4e7',
  borderRadius: 8,
  background: '#fafafa',
};
const btnStyle = {
  flex: 1,
  padding: '8px 12px',
  fontSize: 12,
  border: '1px solid #d4d4d8',
  borderRadius: 6,
  background: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnPrimaryStyle = {
  ...btnStyle,
  background: '#111',
  color: '#fff',
  border: 'none',
};
