'use client';

import { useEffect, useState } from 'react';

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
  uiLocale: 'auto' | 'zh-CN' | 'en';
}

interface ByokConfig {
  configured: boolean;
  baseUrl?: string;
  model?: string;
  keyMask?: string;
  updatedAt?: string;
}

const LANG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: '自动检测页面语言' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
];

export function SettingsClient() {
  const [me, setMe] = useState<UserInfo | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [byok, setByok] = useState<ByokConfig | null>(null);
  const [savingLang, setSavingLang] = useState(false);
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
    if (!confirm('删除 BYOK 配置后会回到平台默认 upstream 并重新计入月配额，确认继续？')) {
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

  async function signOut() {
    setSigningOut(true);
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    location.href = '/';
  }

  if (!me) {
    return <p style={{ marginTop: 32, color: '#888' }}>加载中…</p>;
  }

  if (!me.user) {
    return (
      <section style={{ marginTop: 32 }}>
        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.55 }}>你还没有登录。</p>
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
          登录 →
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
        <Row label="邮箱" value={me.user.email} />
        {me.user.name && <Row label="姓名" value={me.user.name} />}
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
              <div style={{ fontSize: 14, color: '#111' }}>目标语言</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                改写结果输出为这个语言；输入是别的语言时自动翻译。
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
          {signingOut ? '退出中…' : '退出登录'}
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
    const periodEnd = new Date(me.subscription.currentPeriodEnd).toLocaleDateString('zh-CN');
    return (
      <div style={{ ...cardStyle, marginTop: 16 }}>
        <Row label="订阅" value={`Pro ${me.subscription.plan === 'yearly' ? '年付' : '月付'}`} />
        <Row label="状态" value={statusLabel(me.subscription.status)} />
        <Row
          label={me.subscription.cancelAtPeriodEnd ? '将到期于' : '下次续费'}
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
            {loading ? '跳转中…' : '管理订阅 / 发票'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, marginTop: 16 }}>
      <Row label="订阅" value="Free（30 次 / 月）" />
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
          升级 Pro →
        </a>
      </div>
    </div>
  );
}

function statusLabel(s: string): string {
  switch (s) {
    case 'active':
      return '正常';
    case 'trialing':
      return '试用中';
    case 'paused':
      return '已暂停';
    case 'canceled':
      return '已取消（周期末到期）';
    case 'past_due':
      return '逾期未付款';
    case 'expired':
      return '已到期';
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
        setError(data.error ?? '保存失败');
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
        <div style={{ fontSize: 14, color: '#111', fontWeight: 500 }}>BYOK（自带 API Key）</div>
        <div style={{ fontSize: 12, color: '#888', marginTop: 2, lineHeight: 1.6 }}>
          填入你自己的 OpenAI 兼容 endpoint 和 key 后，所有改写直连你的上游，
          <strong style={{ color: '#111' }}>不计入 2,000 次月配额</strong>。Key 用 AES-GCM
          加密存储，永不日志输出。
        </div>
      </div>

      {byok?.configured && !editing && (
        <>
          <Row label="Base URL" value={byok.baseUrl ?? '-'} />
          <Row label="Model" value={byok.model ?? '-'} />
          <Row label="API Key" value={`****${byok.keyMask ?? ''}`} />
          <div style={{ padding: '12px 0', display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setEditing(true)} style={btnSecondary}>
              修改
            </button>
            <button
              type="button"
              onClick={onDelete}
              style={{ ...btnSecondary, color: '#dc2626', borderColor: '#fca5a5' }}
            >
              删除
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
              {saving ? '保存中…' : '保存'}
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
                取消
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
    anonymous: '匿名访客（按 IP）',
    anonymous_install: '扩展未登录',
    free: '免费用户',
    pro: 'Pro',
  };
  const reset = new Date(usage.resetAt);
  const resetLabel = reset.toLocaleString('zh-CN', { month: 'long', day: 'numeric' });
  return (
    <>
      <Row label="档位" value={tierLabel[usage.tier]} />
      <Row
        label="本月配额"
        value={
          Number.isFinite(usage.limit)
            ? `${usage.used} / ${usage.limit}（剩 ${usage.remaining}）`
            : '无限'
        }
      />
      <Row label="下次重置" value={`${resetLabel} 00:00 UTC`} />
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
