'use client';

import type { Locale, StoredLocale } from '@rewrite/shared';
import { REWRITE_TARGET_LABELS, REWRITE_TARGETS } from '@rewrite/shared';
import { useFormatter, useTranslations } from 'next-intl';
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

interface ByokConfig {
  configured: boolean;
  baseUrl?: string;
  model?: string;
  keyMask?: string;
  updatedAt?: string;
}

const PRESET_TARGETS: readonly string[] = ['auto', ...REWRITE_TARGETS];
const CUSTOM_SENTINEL = '__custom__';

export function SettingsClient() {
  const t = useTranslations('page.settings');
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<UserInfo | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [byok, setByok] = useState<ByokConfig | null>(null);
  const [savingLang, setSavingLang] = useState(false);
  const [savingUiLocale, setSavingUiLocale] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // 用户选了 "Custom..." 但还没提交输入框时显示的草稿值
  const [customDraft, setCustomDraft] = useState('');
  // 是否正在编辑自定义（用户主动选了 Custom，或已存值就是 custom）
  const [showCustomInput, setShowCustomInput] = useState(false);

  const isStoredCustom = settings ? !PRESET_TARGETS.includes(settings.targetLang) : false;

  // settings 加载后，如果存的就是 custom 值，激活 input 并把 draft 同步成存值
  useEffect(() => {
    if (settings && isStoredCustom) {
      setCustomDraft(settings.targetLang);
      setShowCustomInput(true);
    }
  }, [settings, isStoredCustom]);

  const uiLocaleOptions: Array<{ value: StoredLocale; label: string }> = [
    { value: 'auto', label: t('lang.autoSystem') },
    { value: 'en', label: 'English' },
    { value: 'zh-CN', label: '简体中文' },
    { value: 'ja', label: '日本語' },
    { value: 'ko', label: '한국어' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'de', label: 'Deutsch' },
  ];

  const customOptionLabel =
    isStoredCustom && settings
      ? t('lang.customLabelFmt', { value: settings.targetLang })
      : t('lang.custom');
  const langOptions: Array<{ value: string; label: string }> = [
    { value: 'auto', label: t('lang.autoFromPage') },
    ...REWRITE_TARGETS.map((code) => ({ value: code, label: REWRITE_TARGET_LABELS[code] })),
    { value: CUSTOM_SENTINEL, label: customOptionLabel },
  ];

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
    if (!confirm(t('byok.deleteConfirm'))) {
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

  function handleLangSelectChange(value: string) {
    if (value === CUSTOM_SENTINEL) {
      // 选中 "Custom..."：仅切换到输入模式，等用户在 input 提交后再 PATCH
      setShowCustomInput(true);
      return;
    }
    setShowCustomInput(false);
    setCustomDraft('');
    updateTargetLang(value);
  }

  function commitCustomTargetLang() {
    if (!settings) return;
    const trimmed = customDraft.trim();
    if (trimmed.length === 0) return;
    if (trimmed === settings.targetLang) return;
    updateTargetLang(trimmed);
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
    return <p style={{ marginTop: 32, color: '#888' }}>{t('loading')}</p>;
  }

  if (!me.user) {
    return (
      <section style={{ marginTop: 32 }}>
        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.55 }}>{t('notSignedIn')}</p>
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
          {t('signIn')}
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
        <Row label={t('field.email')} value={me.user.email} />
        {me.user.name && <Row label={t('field.name')} value={me.user.name} />}
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
              padding: '10px 0',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontSize: 14, color: '#111' }}>{t('lang.target')}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {t('lang.targetHelp')}
                </div>
              </div>
              <select
                value={showCustomInput || isStoredCustom ? CUSTOM_SENTINEL : settings.targetLang}
                onChange={(e) => handleLangSelectChange(e.currentTarget.value)}
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
                {langOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {showCustomInput && (
              <div style={{ marginTop: 12 }}>
                <input
                  type="text"
                  value={customDraft}
                  onChange={(e) => setCustomDraft(e.currentTarget.value)}
                  onBlur={commitCustomTargetLang}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder={t('lang.customPlaceholder')}
                  maxLength={50}
                  disabled={savingLang}
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
                <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
                  {t('lang.customHelp')}
                </div>
              </div>
            )}
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
              <div style={{ fontSize: 14, color: '#111' }}>{t('lang.ui')}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{t('lang.uiHelp')}</div>
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
              {uiLocaleOptions.map((o) => (
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
          {signingOut ? t('signOut.signing') : t('signOut.btn')}
        </button>
      </div>
    </section>
  );
}

function SubscriptionSection({ me }: { me: UserInfo }) {
  const t = useTranslations('page.settings.sub');
  const format = useFormatter();
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
    const periodEnd = format.dateTime(new Date(me.subscription.currentPeriodEnd), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const planLabel = me.subscription.plan === 'yearly' ? t('plan.annual') : t('plan.monthly');
    return (
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <Row label={t('label')} value={planLabel} />
        <Row label={t('statusLabel')} value={statusLabel(t, me.subscription.status)} />
        <Row
          label={me.subscription.cancelAtPeriodEnd ? t('endsOn') : t('nextRenewal')}
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
            {loading ? t('redirecting') : t('manage')}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      <Row label={t('label')} value={t('freeShort', { count: 30 })} />
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
          {t('upgrade')}
        </a>
      </div>
    </div>
  );
}

function statusLabel(t: ReturnType<typeof useTranslations>, s: string): string {
  const known = ['active', 'trialing', 'paused', 'canceled', 'pastDue', 'expired'];
  const key = s === 'past_due' ? 'pastDue' : s;
  return known.includes(key) ? t(`status.${key}`) : s;
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
  const t = useTranslations('page.settings.byok');
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
        setError(data.error ?? t('saveFailed'));
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
        <div style={{ fontSize: 14, color: '#111', fontWeight: 500 }}>{t('title')}</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2, lineHeight: 1.6 }}>
          {t.rich('intro', {
            limit: 2000,
            strong: (chunks) => <strong style={{ color: '#111' }}>{chunks}</strong>,
          })}
        </div>
      </div>

      {byok?.configured && !editing && (
        <>
          <Row label={t('baseUrl')} value={byok.baseUrl ?? '-'} />
          <Row label={t('model')} value={byok.model ?? '-'} />
          <Row label={t('apiKey')} value={`****${byok.keyMask ?? ''}`} />
          <div style={{ padding: '12px 0', display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setEditing(true)} style={btnSecondary}>
              {t('edit')}
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{ ...btnSecondary, color: '#dc2626', borderColor: '#fca5a5' }}
            >
              {t('delete')}
            </button>
          </div>
        </>
      )}

      {(!byok?.configured || editing) && (
        <div style={{ padding: '12px 0' }}>
          <Field
            label={t('baseUrl')}
            value={baseUrl}
            onChange={setBaseUrl}
            placeholder="https://api.openai.com/v1"
          />
          <Field label={t('model')} value={model} onChange={setModel} placeholder="gpt-4o-mini" />
          <Field
            label={t('apiKey')}
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
              {saving ? t('saving') : t('save')}
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
                {t('cancel')}
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
  const t = useTranslations('page.settings.quota');
  const format = useFormatter();
  const tierKeyMap: Record<Usage['tier'], string> = {
    anonymous: 'anonymous',
    anonymous_install: 'anonymousInstall',
    free: 'free',
    pro: 'pro',
  };
  const reset = new Date(usage.resetAt);
  const resetLabel = format.dateTime(reset, { month: 'long', day: 'numeric' });
  return (
    <>
      <Row label={t('tierLabel')} value={t(`tier.${tierKeyMap[usage.tier]}`)} />
      <Row
        label={t('thisMonth')}
        value={
          Number.isFinite(usage.limit)
            ? t('usedFmt', {
                used: usage.used,
                limit: usage.limit,
                remaining: usage.remaining,
              })
            : t('unlimited')
        }
      />
      <Row label={t('resetsOn')} value={`${resetLabel} ${t('resetSuffix')}`} />
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
