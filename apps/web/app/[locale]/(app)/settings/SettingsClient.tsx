'use client';

import type { Locale, StoredLocale } from '@rewrite/shared';
import { QUOTA, REWRITE_TARGET_LABELS, REWRITE_TARGETS } from '@rewrite/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Link, usePathname, useRouter } from '../../../../i18n/navigation.ts';
import { getExtensionInstallUrl } from '../../../../lib/extension-install-url.ts';

// 一次性 dismiss flag（参考 packages/core/src/ui/candidates.ts L18-31 模式）。
// 老用户 deploy 后会看到一次 WelcomeCard，dismiss 后永久消失，无 created_at gate。
const WELCOME_DISMISSED_KEY = '__rewrite_so_settings_welcome_dismissed_v1';
function shouldShowWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_DISMISSED_KEY) !== '1';
  } catch {
    return true;
  }
}
function dismissWelcome(): void {
  try {
    localStorage.setItem(WELCOME_DISMISSED_KEY, '1');
  } catch {
    /* ignore */
  }
}

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
  const tLang = useTranslations('core.lang');
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<UserInfo | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [byok, setByok] = useState<ByokConfig | null>(null);
  const [savingLang, setSavingLang] = useState(false);
  const [savingUiLocale, setSavingUiLocale] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // ?billing=ok 跳回时显示 Pro 升级庆祝 banner（不依赖 verify-checkout 成功——
  // celebrate 用户支付完成的情绪事件，verify 只是让 D1 立即一致）
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  // WelcomeCard 渲染门：一次性 dismiss + 升级用户自动 dismiss
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  // 用户选了 "Custom..." 但还没提交输入框时显示的草稿值
  const [customDraft, setCustomDraft] = useState('');
  // 是否正在编辑自定义（用户主动选了 Custom，或已存值就是 custom）
  const [showCustomInput, setShowCustomInput] = useState(false);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const isStoredCustom = settings ? !PRESET_TARGETS.includes(settings.targetLang) : false;

  // settings 加载后，如果存的就是 custom 值，激活 input 并把 draft 同步成存值
  useEffect(() => {
    if (settings && isStoredCustom) {
      setCustomDraft(settings.targetLang);
      setShowCustomInput(true);
    }
  }, [settings, isStoredCustom]);

  // 用户主动选 "Custom..." 时自动聚焦 input —— 否则用户得再点一下才能输
  useEffect(() => {
    if (showCustomInput && !isStoredCustom) {
      customInputRef.current?.focus();
    }
  }, [showCustomInput, isStoredCustom]);

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
      ? tLang('customLabelFmt', { value: settings.targetLang })
      : tLang('custom');
  const langOptions: Array<{ value: string; label: string }> = [
    { value: 'auto', label: t('lang.autoFromPage') },
    ...REWRITE_TARGETS.map((code) => ({ value: code, label: REWRITE_TARGET_LABELS[code] })),
    { value: CUSTOM_SENTINEL, label: customOptionLabel },
  ];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // billing 跳回时（/settings?billing=ok&checkout_id=xxx）主动 verify checkout 后
      // 再加载数据，避免等 webhook 延迟期间 /v1/me 还看到"free"的错觉。webhook 仍会
      // 发，靠 creem_subscription_id PK 幂等
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.get('billing') === 'ok') {
          // 进入路径立即触发庆祝 banner（不等 verify；celebrate 支付事件本身），
          // 同时永久 dismiss WelcomeCard——升级用户已经"上手"，不需要 new-user 引导
          setShowUpgradeBanner(true);
          dismissWelcome();

          const rawCheckoutId =
            url.searchParams.get('checkout_id') ?? url.searchParams.get('checkoutId');
          // Creem 不替换 {CHECKOUT_ID} 模板时会留 literal 串；只对看起来真实的 id
          // （字母数字 + 短横/下划线，长度 8-200）发 verify 请求。退化时 webhook 兜底
          const checkoutId =
            rawCheckoutId && /^[A-Za-z0-9_-]{8,200}$/.test(rawCheckoutId) ? rawCheckoutId : null;
          if (checkoutId) {
            try {
              await fetch('/v1/billing/verify-checkout', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ checkoutId }),
              });
            } catch {
              /* fail-soft：webhook 兜底 */
            }
          }
          url.searchParams.delete('billing');
          url.searchParams.delete('checkout_id');
          url.searchParams.delete('checkoutId');
          window.history.replaceState({}, '', url.toString());
        }
      }

      try {
        const [meRes, usageRes] = await Promise.all([
          fetch('/v1/me', { credentials: 'include' }),
          fetch('/v1/me/usage', { credentials: 'include' }),
        ]);
        if (cancelled) return;
        const meData: UserInfo = await meRes.json();
        setMe(meData);
        setUsage(await usageRes.json());

        // WelcomeCard 仅在登录 + 没 dismiss 过时显示。在 setMe 之后立刻定值——
        // 与下游 settings/byok fetch 解耦：既避免 settings/byok 还在 fetch 时主 UI
        // 已渲染但 welcome card 慢半拍弹出的视觉跳，也防御 fetch throw 时 welcome
        // 永远不显示的退化。Pro 升级路径已先调 dismissWelcome() 永久关掉，
        // shouldShowWelcome() 此时返 false
        if (meData.user && !cancelled) {
          setWelcomeVisible(shouldShowWelcome());
        }

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
    if (trimmed.length === 0) {
      // 空值离焦 —— 视为放弃自定义。回到 stored 值（settings.targetLang），select
      // 自动跳回当前生效的预设，让用户感知"未生效"，避免 UI 撒谎。
      // 已存自定义值时不 reset（继续显示 input 让用户继续编辑）
      if (!isStoredCustom) {
        setShowCustomInput(false);
        setCustomDraft('');
      }
      return;
    }
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
      {showUpgradeBanner ? (
        <UpgradeBanner onDismiss={() => setShowUpgradeBanner(false)} />
      ) : welcomeVisible ? (
        <WelcomeCard
          onDismiss={() => {
            dismissWelcome();
            setWelcomeVisible(false);
          }}
        />
      ) : null}
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
                  ref={customInputRef}
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
                  placeholder={tLang('customPlaceholder')}
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
                  {tLang('customHelp')}
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

      <ByokSection byok={byok} onChange={setByok} onDelete={deleteByok} />

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
  // Test endpoint 状态机
  const [testState, setTestState] = useState<
    | { kind: 'idle' }
    | { kind: 'testing' }
    | { kind: 'ok'; latencyMs: number }
    | { kind: 'failed'; code: string }
  >({ kind: 'idle' });

  // 字段变更时清掉旧测试结果（防止显示陈旧"已通过"误导用户）
  function withTestReset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setTestState((s) => (s.kind === 'idle' ? s : { kind: 'idle' }));
    };
  }

  async function testByok() {
    setTestState({ kind: 'testing' });
    try {
      const res = await fetch('/v1/me/byok/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ baseUrl, model, apiKey }),
      });
      const data = (await res.json()) as
        | { ok: true; latencyMs: number }
        | { ok: false; error: string };
      if (data.ok) setTestState({ kind: 'ok', latencyMs: data.latencyMs });
      else setTestState({ kind: 'failed', code: data.error ?? 'unknown' });
    } catch {
      setTestState({ kind: 'failed', code: 'unreachable' });
    }
  }

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
            onChange={withTestReset(setBaseUrl)}
            placeholder="https://api.deepseek.com/v1"
          />
          <Field
            label={t('model')}
            value={model}
            onChange={withTestReset(setModel)}
            placeholder="deepseek-v4-flash"
          />
          <Field
            label={t('apiKey')}
            value={apiKey}
            onChange={withTestReset(setApiKey)}
            placeholder="sk-..."
            type="password"
          />
          {error && <p style={{ color: '#dc2626', fontSize: 12, margin: '4px 0' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
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
            <button
              type="button"
              onClick={testByok}
              disabled={!baseUrl || !model || !apiKey || testState.kind === 'testing'}
              style={{
                ...btnSecondary,
                opacity: !baseUrl || !model || !apiKey || testState.kind === 'testing' ? 0.5 : 1,
              }}
            >
              {testState.kind === 'testing' ? t('testing') : t('test')}
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
            {testState.kind === 'ok' && (
              <span style={{ fontSize: 12, color: '#16a34a' }}>
                ✓ {t('testOk', { latencyMs: testState.latencyMs })}
              </span>
            )}
            {testState.kind === 'failed' && (
              <span style={{ fontSize: 12, color: '#dc2626' }}>
                ✗ {t(`testFailed.${testState.code}` as 'testFailed.unknown')}
              </span>
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

function WelcomeCard({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations('page.settings.welcomeCard');
  const tCore = useTranslations('core');
  return (
    <section
      aria-label={t('title')}
      style={{
        position: 'relative',
        padding: '16px 20px',
        marginBottom: 16,
        border: '1px solid #3b82f6',
        borderRadius: 10,
        background: '#eff6ff',
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label={tCore('dismiss')}
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          width: 22,
          height: 22,
          border: 'none',
          background: 'transparent',
          fontSize: 16,
          cursor: 'pointer',
          color: '#64748b',
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
      <h2 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#1e3a8a' }}>
        {t('title')}
      </h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#1e40af', lineHeight: 1.55 }}>
        {t('description')}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link
          href="/try"
          style={{
            padding: '7px 14px',
            background: '#1d4ed8',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {t('ctaTry')}
        </Link>
        <a
          href={getExtensionInstallUrl()}
          target="_blank"
          rel="noopener"
          style={{
            padding: '7px 14px',
            background: '#fff',
            color: '#1d4ed8',
            textDecoration: 'none',
            border: '1px solid #93c5fd',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {t('ctaInstall')}
        </a>
      </div>
    </section>
  );
}

function UpgradeBanner({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations('page.settings.upgradeBanner');
  const tCore = useTranslations('core');
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'relative',
        padding: '14px 20px',
        marginBottom: 16,
        border: '1px solid #16a34a',
        borderRadius: 10,
        background: '#ecfdf5',
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label={tCore('dismiss')}
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          width: 22,
          height: 22,
          border: 'none',
          background: 'transparent',
          fontSize: 16,
          cursor: 'pointer',
          color: '#15803d',
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: '#14532d' }}>
        ✓ {t('title')}
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: '#166534', lineHeight: 1.55 }}>
        {t('subtitle', { count: QUOTA.pro })}
      </p>
    </div>
  );
}

const cardStyle = {
  padding: '4px 16px',
  border: '1px solid #e4e4e7',
  borderRadius: 10,
  background: '#fff',
};
