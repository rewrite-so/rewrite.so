'use client';

import type { Locale, StoredLocale } from '@rewrite/shared';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from '../../../../i18n/navigation.ts';

interface UserInfo {
  user: { id: string; email: string; name?: string | null; image?: string | null } | null;
  tier?: 'free' | 'pro';
  subscription?: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
}

interface Usage {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  tier: 'anonymous' | 'anonymous_install' | 'free' | 'pro';
}

interface UserSettings {
  targetLang: string;
  uiLocale: StoredLocale;
}

const UI_LOCALE_OPTIONS: Array<{ value: StoredLocale; label: string }> = [
  { value: 'auto', label: 'Auto (use system)' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
];

interface ByokConfig {
  configured: boolean;
  baseUrl?: string;
  model?: string;
  keyMask?: string;
  updatedAt?: string;
}

const LANG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: 'Auto-detect from page' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '简体中文 (Chinese, Simplified)' },
  { value: 'ja', label: '日本語 (Japanese)' },
  { value: 'ko', label: '한국어 (Korean)' },
  { value: 'es', label: 'Español (Spanish)' },
  { value: 'fr', label: 'Français (French)' },
  { value: 'de', label: 'Deutsch (German)' },
];

export function SettingsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<UserInfo | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [byok, setByok] = useState<ByokConfig | null>(null);
  const [savingLang, setSavingLang] = useState(false);
  const [savingUiLocale, setSavingUiLocale] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, usageRes] = await Promise.all([
          fetch('/v1/me', { credentials: 'include' }),
          fetch('/v1/me/usage', { credentials: 'include' }),
        ]);
        if (cancelled) return;
        const meData: UserInfo = await meRes.json();
        setMe(meData);
        setUsage(await usageRes.json());

        // 仅登录用户加载 settings + byok
        if (meData.user) {
          const [sRes, byokRes] = await Promise.all([
            fetch('/v1/me/settings', { credentials: 'include' }),
            fetch('/v1/me/byok', { credentials: 'include' }),
          ]);
          if (sRes.ok && !cancelled) setSettings(await sRes.json());
          if (byokRes.ok && !cancelled) setByok(await byokRes.json());
        }
      } catch (err) {
        console.warn('settings load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function deleteByok() {
    if (
      !confirm(
        'Delete BYOK config? Rewrites will fall back to the default upstream and start counting against your monthly quota again.',
      )
    ) {
      return;
    }
    const res = await fetch('/v1/me/byok', { method: 'DELETE', credentials: 'include' });
    if (res.ok) setByok({ configured: false });
  }

  async function updateTargetLang(value: string) {
    if (!settings || savingLang) return;
    setSavingLang(true);
    try {
      const res = await fetch('/v1/me/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetLang: value }),
      });
      if (res.ok) setSettings(await res.json());
    } finally {
      setSavingLang(false);
    }
  }

  async function updateUiLocale(value: StoredLocale) {
    if (!settings || savingUiLocale) return;
    setSavingUiLocale(true);
    try {
      const res = await fetch('/v1/me/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ uiLocale: value }),
      });
      if (res.ok) {
        setSettings(await res.json());
        // 同步到 next-intl 的 cookie，并切换 URL 到对应 locale —— 让浏览器 UI 立刻换语言。
        // 'auto' 时清 cookie，让 middleware 退化到 Accept-Language 检测。
        if (value === 'auto') {
          // biome-ignore lint/suspicious/noDocumentCookie: 标准 API 足够；Cookie Store 跨浏览器尚未普及
          document.cookie = 'NEXT_LOCALE=; path=/; max-age=0; samesite=lax';
          // 'auto' 仍需要刷新到具体 locale，让 middleware 重新协商。简单粗暴：reload。
          location.reload();
        } else {
          // biome-ignore lint/suspicious/noDocumentCookie: 同上
          document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=31536000; samesite=lax`;
          router.replace(pathname, { locale: value as Locale });
        }
      }
    } finally {
      setSavingUiLocale(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    location.href = '/';
  }

  if (!me) {
    return <p style={{ marginTop: 32, color: '#888' }}>Loading…</p>;
  }

  if (!me.user) {
    return (
      <section style={{ marginTop: 32 }}>
        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.55 }}>You’re not signed in.</p>
        <a
          href="/login"
          style={{
            display: 'inline-block',
            marginTop: 12,
            padding: '10px 18px',
            background: '#111',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Sign in →
        </a>
        {usage && (
          <div style={{ ...cardStyle, marginTop: 24 }}>
            <Quota usage={usage} />
          </div>
        )}
      </section>
    );
  }

  return (
    <section style={{ marginTop: 32 }}>
      <div style={cardStyle}>
        <Row label="Email" value={me.user.email} />
        {me.user.name && <Row label="Name" value={me.user.name} />}
      </div>

      {usage && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <Quota usage={usage} />
        </div>
      )}

      {settings && (
        <div style={{ ...cardStyle, marginTop: 16 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <div>
              <div style={{ fontSize: 14, color: '#111' }}>Target language</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                Rewrites are produced in this language. If your input is in a different language,
                it’s translated.
              </div>
            </div>
            <select
              value={settings.targetLang}
              onChange={(e) => updateTargetLang(e.currentTarget.value)}
              disabled={savingLang}
              style={{
                padding: '7px 10px',
                fontSize: 13,
                border: '1px solid #d4d4d8',
                borderRadius: 6,
                background: '#fff',
                fontFamily: 'inherit',
                minWidth: 180,
              }}
            >
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 0',
            }}
          >
            <div>
              <div style={{ fontSize: 14, color: '#111' }}>UI language</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                Interface language. Independent of the rewrite target language above.
              </div>
            </div>
            <select
              value={settings.uiLocale}
              onChange={(e) => updateUiLocale(e.currentTarget.value as StoredLocale)}
              disabled={savingUiLocale}
              style={{
                padding: '7px 10px',
                fontSize: 13,
                border: '1px solid #d4d4d8',
                borderRadius: 6,
                background: '#fff',
                fontFamily: 'inherit',
                minWidth: 180,
              }}
            >
              {UI_LOCALE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <SubscriptionSection me={me} />

      {me.tier === 'pro' && <ByokSection byok={byok} onChange={setByok} onDelete={deleteByok} />}

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          style={{
            padding: '8px 14px',
            fontSize: 13,
            background: '#fff',
            color: '#dc2626',
            border: '1px solid #fca5a5',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </section>
  );
}

function SubscriptionSection({ me }: { me: UserInfo }) {
  const [loading, setLoading] = useState(false);
  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch('/v1/billing/portal', { credentials: 'include' });
      const data = (await res.json()) as { url?: string };
      if (data.url) location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  if (me.tier === 'pro' && me.subscription) {
    const periodEnd = new Date(me.subscription.currentPeriodEnd).toLocaleDateString('en-US');
    return (
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <Row
          label="Subscription"
          value={`Pro ${me.subscription.plan === 'yearly' ? 'Annual' : 'Monthly'}`}
        />
        <Row label="Status" value={statusLabel(me.subscription.status)} />
        <Row
          label={me.subscription.cancelAtPeriodEnd ? 'Ends on' : 'Next renewal'}
          value={periodEnd}
        />
        <div style={{ padding: '12px 0' }}>
          <button
            type="button"
            onClick={openPortal}
            disabled={loading}
            style={{
              padding: '7px 12px',
              fontSize: 13,
              background: '#fff',
              color: '#111',
              border: '1px solid #d4d4d8',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Redirecting…' : 'Manage subscription / invoices'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      <Row label="Subscription" value="Free (30 rewrites / month)" />
      <div style={{ padding: '12px 0' }}>
        <a
          href="/billing"
          style={{
            display: 'inline-block',
            padding: '7px 12px',
            fontSize: 13,
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          Upgrade to Pro →
        </a>
      </div>
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case 'active':
      return 'Active';
    case 'trialing':
      return 'Trialing';
    case 'paused':
      return 'Paused';
    case 'canceled':
      return 'Canceled (ends at period end)';
    case 'past_due':
      return 'Past due';
    case 'expired':
      return 'Expired';
    default:
      return s;
  }
}

function ByokSection({
  byok,
  onChange,
  onDelete,
}: {
  byok: ByokConfig | null;
  onChange: (b: ByokConfig) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/v1/me/byok', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ baseUrl, model, apiKey }),
      });
      const data = (await res.json()) as { configured?: boolean; error?: string; keyMask?: string };
      if (!res.ok) {
        setError(data.error ?? 'Save failed');
        return;
      }
      onChange({
        configured: true,
        baseUrl,
        model,
        keyMask: data.keyMask,
        updatedAt: new Date().toISOString(),
      });
      setEditing(false);
      setApiKey('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      <div
        style={{
          padding: '10px 0',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <div style={{ fontSize: 14, color: '#111', fontWeight: 500 }}>
          BYOK (Bring Your Own Key)
        </div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2, lineHeight: 1.6 }}>
          Plug in your own OpenAI-compatible endpoint and key. Rewrites go directly to your provider
          and <strong style={{ color: '#111' }}>don’t count against the 2,000 / month quota</strong>
          . Your key is stored AES-GCM encrypted and never written to logs.
        </div>
      </div>

      {byok?.configured && !editing && (
        <>
          <Row label="Base URL" value={byok.baseUrl ?? '-'} />
          <Row label="Model" value={byok.model ?? '-'} />
          <Row label="API Key" value={`****${byok.keyMask ?? ''}`} />
          <div style={{ padding: '12px 0', display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setEditing(true)} style={btnSecondary}>
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{ ...btnSecondary, color: '#dc2626', borderColor: '#fca5a5' }}
            >
              Delete
            </button>
          </div>
        </>
      )}

      {(!byok?.configured || editing) && (
        <div style={{ padding: '12px 0' }}>
          <Field
            label="Base URL"
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="https://api.openai.com/v1"
          />
          <Field label="Model" value={model} onChange={setModel} placeholder="gpt-4o-mini" />
          <Field
            label="API Key"
            value={apiKey}
            onChange={setApiKey}
            placeholder="sk-..."
            type="password"
          />
          {error && <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={save}
              disabled={!baseUrl || !model || !apiKey || saving}
              style={{
                padding: '7px 12px',
                fontSize: 13,
                background: '#111',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                opacity: !baseUrl || !model || !apiKey || saving ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                style={btnSecondary}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '7px 10px',
          fontSize: 13,
          border: '1px solid #d4d4d8',
          borderRadius: 6,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </label>
  );
}

const btnSecondary = {
  padding: '7px 12px',
  fontSize: 13,
  background: '#fff',
  color: '#111',
  border: '1px solid #d4d4d8',
  borderRadius: 6,
  cursor: 'pointer',
};

function Quota({ usage }: { usage: Usage }) {
  const tierLabel: Record<Usage['tier'], string> = {
    anonymous: 'Anonymous (per IP)',
    anonymous_install: 'Extension (unsigned)',
    free: 'Free',
    pro: 'Pro',
  };
  const reset = new Date(usage.resetAt);
  const resetLabel = reset.toLocaleString('en-US', { month: 'long', day: 'numeric' });
  return (
    <>
      <Row label="Tier" value={tierLabel[usage.tier]} />
      <Row
        label="This month"
        value={
          Number.isFinite(usage.limit)
            ? `${usage.used} / ${usage.limit} (${usage.remaining} left)`
            : 'Unlimited'
        }
      />
      <Row label="Resets on" value={`${resetLabel} 00:00 UTC`} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: '1px solid #f0f0f0',
        fontSize: 14,
      }}
    >
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: '#111' }}>{value}</span>
    </div>
  );
}

const cardStyle = {
  padding: '4px 16px',
  border: '1px solid #e4e4e7',
  borderRadius: 10,
  background: '#fff',
};
