'use client';

import { useEffect, useState } from 'react';

interface UserInfo {
  user: { id: string; email: string; name?: string | null; image?: string | null } | null;
}

interface Usage {
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
  tier: 'anonymous' | 'anonymous_install' | 'free' | 'pro';
}

export function SettingsClient() {
  const [me, setMe] = useState<UserInfo | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
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
        setMe(await meRes.json());
        setUsage(await usageRes.json());
      } catch (err) {
        console.warn('settings load failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          <div style={cardStyle}>
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
