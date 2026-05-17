'use client';

import { PRO_PRICE } from '@rewrite/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { track } from '../../../../lib/analytics.ts';

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
  earlyBird?: {
    isParticipant: boolean;
    discountActive: boolean;
    proLapsesAt: string | null;
    pendingGift: { days: number; activatesAt: string; expiresAt: string } | null;
  } | null;
}

/** Early-bird 折扣率与 packages/shared/EarlyBirdConfigSchema.perks.discount.percentage 对齐。
 *  70 = 70% off = 用户付 30%。改这里前请同步 admin SPA 上创建的活动 config 与
 *  Creem dashboard 折扣码（CLAUDE.md 「Creem 折扣码人工建立步骤」）。
 */
const EARLY_BIRD_USER_PAY_RATIO = 0.3;

export function BillingClient() {
  const t = useTranslations('page.billing');
  const format = useFormatter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [plan, setPlan] = useState<Plan>('yearly');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/v1/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((data: MeResponse) => setMe(data))
      .catch(() => setMe({ user: null, subscription: null, earlyBird: null }));
  }, []);

  async function checkout(p: Plan) {
    setLoading(true);
    setError(null);
    // Fire checkout_start from the client (not the API) so the event carries
    // visitor_id + UTM context — see plan: "checkout_start 从前端发". Even if
    // the request below fails, the click intent is recorded for funnel math.
    track('checkout_start', { plan: p });
    try {
      const res = await fetch('/v1/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: p,
          // {CHECKOUT_ID} 是 Stripe-style 模板占位符——Creem 在 redirect 时替换成
          // 实际 checkout id。SettingsClient 拿到后调 /v1/billing/verify-checkout
          // 主动落库，避开 webhook 延迟期间用户感知"还是 free"的错觉。
          // 如果 Creem 不替换，literal '{CHECKOUT_ID}' 会被 SettingsClient 的 UUID
          // 形状校验过滤掉，verify 不 fire，退化到纯 webhook 路径（仍能落库，只是慢）。
          successUrl: `${window.location.origin}/settings?billing=ok&checkout_id={CHECKOUT_ID}`,
        }),
      });
      if (res.status === 401) {
        // not signed in → /login then back to /billing
        location.href = `/login?next=/billing`;
        return;
      }
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? t('error.checkoutFailed'));
        return;
      }
      location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error.networkError'));
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
        setError(data.error ?? t('error.portalFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  if (!me) {
    return <p style={{ marginTop: 32, color: 'var(--text-muted)' }}>{t('loading')}</p>;
  }

  const subscribed = me.subscription !== null && me.tier === 'pro';
  const earlyBirdActive = me.earlyBird?.discountActive === true;
  // Keep as a string so trailing zeros (e.g. "$4.20") don't get stripped by
  // `Number(...)` rounding when toFixed → +num → string round-trip. The plain
  // price (no discount) is a fixed constant with .99 cents so it never loses
  // precision; templating both as strings keeps the JSX uniform.
  const monthlyPrice = earlyBirdActive
    ? (PRO_PRICE.monthly * EARLY_BIRD_USER_PAY_RATIO).toFixed(2)
    : PRO_PRICE.monthly.toFixed(2);
  const yearlyMonthlyPrice = earlyBirdActive
    ? (PRO_PRICE.yearlyMonthly * EARLY_BIRD_USER_PAY_RATIO).toFixed(2)
    : PRO_PRICE.yearlyMonthly.toFixed(2);
  const subscribedDate = me.subscription
    ? format.dateTime(new Date(me.subscription.currentPeriodEnd), {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '-';
  const subscribedPlanLabel =
    me.subscription?.plan === 'yearly' ? t('subscribed.planAnnual') : t('subscribed.planMonthly');

  return (
    <section style={{ marginTop: 32 }}>
      {earlyBirdActive && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--warning-50)',
            border: '1px solid var(--warning-200)',
            borderRadius: 8,
            fontSize: 14,
            color: 'var(--warning-700)',
            marginBottom: 16,
          }}
          title={t('earlyBirdBanner.tooltip')}
        >
          <strong>{t('earlyBirdBanner.title')}</strong> · {t('earlyBirdBanner.body')}
        </div>
      )}
      {subscribed && (
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--success-50)',
            border: '1px solid var(--success-200)',
            borderRadius: 8,
            fontSize: 14,
            color: 'var(--success-700)',
            marginBottom: 24,
          }}
        >
          {/* 3 个独立 full-sentence keys（不拼接）— ja/ko 等语种 particle/spacing
              对拼接敏感，每个 locale 完整拥有句子结构。pendingGift 仅在 cancel
              状态下补充提示：续费用户的 gift granted_at 在 join 时固定为当时的
              sub_end，时间到了 gift 技术上会激活，但会跟续费的 sub Pro 期重叠
              对用户视觉上不可见，提示反而徒增噪声；cancel 用户才是 gift 真正
              「补位」的场景（sub 到期 → gift 接上 90 天 Pro），提示有价值。 */}
          {(() => {
            const pending = me.earlyBird?.pendingGift;
            const bannerKey = me.subscription?.cancelAtPeriodEnd
              ? pending
                ? 'subscribed.lineCancelingWithGift'
                : 'subscribed.lineCanceling'
              : 'subscribed.lineRenewing';
            return t(bannerKey, {
              plan: subscribedPlanLabel,
              date: subscribedDate,
              giftDays: pending?.days ?? 0,
            });
          })()}
          <button
            type="button"
            onClick={openPortal}
            disabled={loading}
            style={{
              marginLeft: 12,
              padding: '4px 10px',
              fontSize: 12,
              background: 'var(--neutral-0)',
              color: 'var(--success-700)',
              border: '1px solid var(--success-200)',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {t('subscribed.manage')}
          </button>
        </div>
      )}

      {/* Monthly / Yearly toggle */}
      <div
        style={{
          display: 'inline-flex',
          padding: 4,
          background: 'var(--surface-muted)',
          borderRadius: 8,
          marginBottom: 24,
        }}
      >
        <ToggleBtn active={plan === 'monthly'} onClick={() => setPlan('monthly')}>
          {t('toggle.monthly')}
        </ToggleBtn>
        <ToggleBtn active={plan === 'yearly'} onClick={() => setPlan('yearly')}>
          {t('toggle.annual')}
          <span
            style={{
              marginLeft: 6,
              padding: '2px 6px',
              background: 'var(--success-100)',
              color: 'var(--success-700)',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {t('toggle.save', { percent: PRO_PRICE.yearlySavingsPercent })}
          </span>
        </ToggleBtn>
      </div>

      {/* plan cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <PlanCard
          title={t('free.title')}
          price="$0"
          period=""
          features={[t('free.feat1'), t('free.feat2'), t('free.feat3'), t('free.feat4')]}
          cta={subscribed ? t('free.ctaLower') : me.user ? t('free.ctaCurrent') : t('free.ctaUse')}
          disabled
        />
        <PlanCard
          title={t('pro.title')}
          price={plan === 'monthly' ? `$${monthlyPrice}` : `$${yearlyMonthlyPrice}`}
          originalPrice={
            earlyBirdActive
              ? plan === 'monthly'
                ? `$${PRO_PRICE.monthly}`
                : `$${PRO_PRICE.yearlyMonthly}`
              : undefined
          }
          period={plan === 'monthly' ? t('pro.periodMonthly') : t('pro.periodYearly')}
          features={[t('pro.feat1'), t('pro.feat2'), t('pro.feat3'), t('pro.feat4')]}
          highlight
          cta={
            subscribed
              ? t('pro.ctaSubscribed')
              : loading
                ? t('pro.ctaRedirecting')
                : plan === 'monthly'
                  ? t('pro.ctaMonthly')
                  : t('pro.ctaAnnual')
          }
          onClick={() => !subscribed && checkout(plan)}
          disabled={subscribed || loading}
        />
        {subscribed && earlyBirdActive && !me.subscription?.cancelAtPeriodEnd && (
          <p
            style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, gridColumn: '1 / -1' }}
          >
            {t('earlyBirdBanner.subscribedHint')}
          </p>
        )}
      </div>

      {error && (
        <p style={{ color: 'var(--danger-500)', fontSize: 13, marginTop: 16 }}>
          {t('error.prefix')}: {error}
        </p>
      )}
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
        background: active ? 'var(--neutral-0)' : 'transparent',
        color: active ? 'var(--neutral-950)' : 'var(--text-secondary)',
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
  originalPrice,
  period,
  features,
  cta,
  onClick,
  disabled,
  highlight,
}: {
  title: string;
  price: string;
  /** When present, rendered as struck-through prefix (e.g. early-bird discount) */
  originalPrice?: string;
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
        border: highlight ? '2px solid var(--neutral-950)' : '1px solid var(--neutral-200)',
        borderRadius: 12,
        background: 'var(--neutral-0)',
      }}
    >
      <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
        {originalPrice && (
          <span
            style={{ fontSize: 18, color: 'var(--text-muted)', textDecoration: 'line-through' }}
          >
            {originalPrice}
          </span>
        )}
        <span style={{ fontSize: 32, fontWeight: 700 }}>{price}</span>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{period}</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginBottom: 24 }}>
        {features.map((f) => (
          <li key={f} style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '4px 0' }}>
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
          background: highlight && !disabled ? 'var(--neutral-950)' : 'var(--surface-muted)',
          color: highlight && !disabled ? 'var(--neutral-0)' : 'var(--text-muted)',
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
