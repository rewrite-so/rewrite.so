import { useEffect, useState } from 'preact/hooks';
import { API_BASE, WEB_BASE } from '../lib/config.ts';
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
        const res = await fetch(
          `${API_BASE}/v1/me/usage?installId=${encodeURIComponent(installId)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Usage;
        if (!cancelled) setUsage(data);
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
          onClick={() => chrome.tabs.create({ url: `${WEB_BASE}/login` })}
        >
          {usage?.tier === 'free' || usage?.tier === 'pro'
            ? t('ext.popup.myAccount')
            : t('ext.popup.signIn')}
        </button>
      </div>
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
