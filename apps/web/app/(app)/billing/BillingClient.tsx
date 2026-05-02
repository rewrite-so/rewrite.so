'use client';

import { PRO_PRICE } from '@rewrite/shared';
import { useEffect, useState } from 'react';

type Plan = 'monthly' | 'yearly';

interface MeResponse {
  user: { id: string; email: string } | null;
  tier?: 'free' | 'pro';
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
}

export function BillingClient() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [plan, setPlan] = useState<Plan>('yearly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/v1/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: MeResponse) => setMe(data))
      .catch(() => setMe({ user: null, subscription: null }));
  }, []);

  async function checkout(p: Plan) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/v1/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: p,
          successUrl: `${window.location.origin}/settings?billing=ok`,
        }),
      });
      if (res.status === 401) {
        // not signed in → /login then back to /billing
        location.href = `/login?next=/billing`;
        return;
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to create checkout');
        return;
      }
      location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    setLoading(true);
    try {
      const res = await fetch('/v1/billing/portal', { credentials: 'include' });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        location.href = data.url;
      } else {
        setError(data.error ?? 'Failed to open portal');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!me) {
    return <p style={{ marginTop: 32, color: '#888' }}>Loading…</p>;
  }

  const subscribed = me.subscription !== null && me.tier === 'pro';

  return (
    <section style={{ marginTop: 32 }}>
      {subscribed && (
        <div
          style={{
            padding: '12px 16px',
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 8,
            fontSize: 14,
            color: '#166534',
            marginBottom: 24,
          }}
        >
          You’re on Pro ({me.subscription?.plan === 'yearly' ? 'Annual' : 'Monthly'}). Period ends:{' '}
          {me.subscription
            ? new Date(me.subscription.currentPeriodEnd).toLocaleDateString('en-US')
            : '-'}
          {me.subscription?.cancelAtPeriodEnd && ' (will cancel at period end)'}
          <button
            type="button"
            onClick={openPortal}
            disabled={loading}
            style={{
              marginLeft: 12,
              padding: '4px 10px',
              fontSize: 12,
              background: '#fff',
              color: '#166534',
              border: '1px solid #86efac',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Manage subscription
          </button>
        </div>
      )}

      {/* Monthly / Yearly toggle */}
      <div
        style={{
          display: 'inline-flex',
          padding: 4,
          background: '#f4f4f5',
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <ToggleBtn active={plan === 'monthly'} onClick={() => setPlan('monthly')}>
          Monthly
        </ToggleBtn>
        <ToggleBtn active={plan === 'yearly'} onClick={() => setPlan('yearly')}>
          Annual
          <span
            style={{
              marginLeft: 6,
              padding: '2px 6px',
              background: '#dcfce7',
              color: '#166534',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            save {PRO_PRICE.yearlySavingsPercent}%
          </span>
        </ToggleBtn>
      </div>

      {/* plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <PlanCard
          title="Free"
          price="$0"
          period=""
          features={[
            '30 rewrites / month',
            'All 3 streaming styles',
            'Auto language detection',
            'Privacy first — inputs never stored',
          ]}
          cta={subscribed ? 'Lower tier' : me.user ? 'Current tier' : 'Use free'}
          disabled
        />
        <PlanCard
          title="Pro"
          price={plan === 'monthly' ? `$${PRO_PRICE.monthly}` : `$${PRO_PRICE.yearlyMonthly}`}
          period={
            plan === 'monthly' ? '/ month' : `/ month (billed annually $${PRO_PRICE.yearlyTotal})`
          }
          features={[
            '2,000 rewrites / month',
            'All 3 streaming styles',
            'BYOK = unlimited',
            'Priority support',
          ]}
          highlight
          cta={
            subscribed
              ? 'Subscribed'
              : loading
                ? 'Redirecting…'
                : `Subscribe to Pro ${plan === 'monthly' ? 'Monthly' : 'Annual'}`
          }
          onClick={() => !subscribed && checkout(plan)}
          disabled={subscribed || loading}
        />
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginTop: 16 }}>Error: {error}</p>}
    </section>
  );
}

function ToggleBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        background: active ? '#fff' : 'transparent',
        color: active ? '#111' : '#666',
        border: 'none',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {children}
    </button>
  );
}

function PlanCard({
  title,
  price,
  period,
  features,
  cta,
  onClick,
  disabled,
  highlight,
}: {
  title: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: 24,
        border: highlight ? '2px solid #111' : '1px solid #e4e4e7',
        borderRadius: 12,
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 14, color: '#888', marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 16 }}>
        <span style={{ fontSize: 32, fontWeight: 700 }}>{price}</span>
        <span style={{ fontSize: 13, color: '#888' }}>{period}</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 24 }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 13, color: '#444', padding: '4px 0' }}>
            ✓ {f}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: highlight && !disabled ? '#111' : '#f4f4f5',
          color: highlight && !disabled ? '#fff' : '#888',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {cta}
      </button>
    </div>
  );
}
