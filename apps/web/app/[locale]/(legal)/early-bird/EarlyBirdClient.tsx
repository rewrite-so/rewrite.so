'use client';

/**
 * Early-bird marketing + signup page.
 *
 * - Fetches `GET /v1/campaigns/early-bird` on mount; renders marketing copy
 *   from `i18n_json` (admin-editable, no redeploy).
 * - CTA: not logged in → `/login?next=/early-bird`; logged in + not joined →
 *   `POST /v1/campaigns/early-bird/join` → redirect to `/billing`; already
 *   joined → redirect to `/billing`.
 * - Disabled / past `ends_at` → renders "活动已结束" section instead of 404
 *   so external links stay stable.
 */

import { PRO_PRICE } from '@rewrite/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useRouter } from '../../../../i18n/navigation.ts';

interface CampaignViewer {
  joined: boolean;
  joinedAt: number | null;
}

interface CampaignResponse {
  slug: string;
  type: 'early_bird';
  enabled: boolean;
  starts_at: number;
  ends_at: number;
  capacity: number | null;
  config: {
    perks: {
      gift_days: number;
      discount: {
        code: string;
        percentage: number;
        duration: 'forever' | 'once' | 'repeating';
        grace_period_days: number;
      };
    };
    require_login: true;
  };
  i18n: Record<
    string,
    {
      title: string;
      subtitle?: string;
      heroBody?: string;
      perksTitle?: string;
      ctaText?: string;
    }
  >;
  viewer?: CampaignViewer;
}

type LoadState = 'loading' | 'active' | 'ended' | 'error';

interface MeResponse {
  user: { id: string; email: string } | null;
}

export default function EarlyBirdClient({ locale }: { locale: string }) {
  const t = useTranslations('page.early-bird');
  const router = useRouter();
  const [state, setState] = useState<LoadState>('loading');
  const [campaign, setCampaign] = useState<CampaignResponse | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [campRes, meRes] = await Promise.all([
          fetch('/v1/campaigns/early-bird', { credentials: 'include' }),
          fetch('/v1/me', { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (meRes.ok) {
          const me = (await meRes.json()) as MeResponse;
          setSignedIn(!!me.user);
        }
        if (campRes.status === 404) {
          setState('ended');
          return;
        }
        if (!campRes.ok) {
          setState('error');
          return;
        }
        const data = (await campRes.json()) as CampaignResponse;
        const now = Date.now();
        if (!data.enabled || now > data.ends_at) {
          setState('ended');
          setCampaign(data);
          return;
        }
        setCampaign(data);
        setState('active');
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleJoin() {
    if (!campaign) return;
    if (campaign.viewer?.joined) {
      router.push('/billing');
      return;
    }
    if (!signedIn) {
      // Redirect to login with next pointing back here. Use raw window.location
      // because next-intl `Link` href is locale-aware and we want a clean param.
      const nextPath = `${locale === 'en' ? '' : `/${locale}`}/early-bird`;
      window.location.href = `${locale === 'en' ? '' : `/${locale}`}/login?next=${encodeURIComponent(nextPath)}`;
      return;
    }
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch('/v1/campaigns/early-bird/join', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.status === 200) {
        router.push('/billing?from=early-bird');
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      if (body.code === 'CAMPAIGN_ENDED') {
        setJoinError(t('errors.ended'));
        setState('ended');
        return;
      }
      if (body.code === 'CAMPAIGN_FULL') {
        setJoinError(t('errors.full'));
        return;
      }
      if (res.status === 429) {
        setJoinError(t('errors.rateLimit'));
        return;
      }
      setJoinError(t('errors.generic'));
    } catch {
      setJoinError(t('errors.generic'));
    } finally {
      setJoining(false);
    }
  }

  // ===== render variants =====

  if (state === 'loading') {
    return (
      <article>
        <h1 style={H1}>{t('title')}</h1>
        <p style={SUBTITLE}>{t('loading')}</p>
      </article>
    );
  }

  if (state === 'error') {
    return (
      <article>
        <h1 style={H1}>{t('title')}</h1>
        <p style={SUBTITLE}>{t('errors.loadFailed')}</p>
      </article>
    );
  }

  if (state === 'ended') {
    return (
      <article>
        <h1 style={H1}>{t('ended.title')}</h1>
        <p style={SUBTITLE}>{t('ended.body')}</p>
        <a href={localePath(locale, '/billing')} style={BUTTON_PRIMARY}>
          {t('ended.cta')}
        </a>
      </article>
    );
  }

  // active state
  if (!campaign) return null;
  const i18nForLocale = campaign.i18n[locale] ?? campaign.i18n.en ?? { title: t('title') };
  const giftDays = campaign.config.perks.gift_days;
  const grace = campaign.config.perks.discount.grace_period_days;
  const percentage = campaign.config.perks.discount.percentage;
  // 70 off = 用户付 30% = "3 折"，需要由 i18n catalog 翻译成区域表述
  const userPaysPercent = 100 - percentage;
  const discountedMonthly = (PRO_PRICE.monthly * userPaysPercent) / 100;
  const discountedYearlyMonthly = (PRO_PRICE.yearlyMonthly * userPaysPercent) / 100;
  const joined = campaign.viewer?.joined === true;

  return (
    <article>
      <h1 style={H1}>{i18nForLocale.title}</h1>
      {i18nForLocale.subtitle && <p style={SUBTITLE}>{i18nForLocale.subtitle}</p>}
      {i18nForLocale.heroBody && <p style={BODY}>{i18nForLocale.heroBody}</p>}

      <h2 style={H2}>{i18nForLocale.perksTitle ?? t('perks.title')}</h2>
      <ul style={PERK_LIST}>
        <li style={PERK_ITEM}>
          <strong>{t('perks.giftDaysLabel', { days: giftDays })}</strong> —{' '}
          {t('perks.giftDaysBody')}
        </li>
        <li style={PERK_ITEM}>
          <strong>{t('perks.discountLabel', { percentage })}</strong>{' '}
          <span style={{ color: '#888', fontSize: 13 }}>
            (
            {t('perks.discountPricePreview', {
              originalMonthly: PRO_PRICE.monthly.toFixed(2),
              discountedMonthly: discountedMonthly.toFixed(2),
              originalYearly: PRO_PRICE.yearlyMonthly.toFixed(2),
              discountedYearly: discountedYearlyMonthly.toFixed(2),
            })}
            )
          </span>{' '}
          — {t('perks.discountBody')}
        </li>
      </ul>

      <div style={WINDOW_NOTE}>
        <strong>{t('window.title')}</strong>
        <p style={{ color: '#555', marginTop: 4 }}>{t('window.body', { giftDays, grace })}</p>
      </div>

      <div style={{ marginTop: 32 }}>
        {joined ? (
          <a href={localePath(locale, '/billing')} style={BUTTON_PRIMARY}>
            {t('cta.alreadyJoined')}
          </a>
        ) : (
          <button
            type="button"
            onClick={handleJoin}
            disabled={joining}
            style={joining ? BUTTON_DISABLED : BUTTON_PRIMARY}
          >
            {joining
              ? t('cta.joining')
              : signedIn
                ? (i18nForLocale.ctaText ?? t('cta.loggedIn'))
                : t('cta.notLoggedIn')}
          </button>
        )}
        {joinError && (
          <p role="alert" style={{ color: '#dc2626', marginTop: 12, fontSize: 13 }}>
            {joinError}
          </p>
        )}
      </div>
    </article>
  );
}

/** /xx-XX/path with default-locale stripping (mirrors metadata.ts:localePath) */
function localePath(locale: string, path: string): string {
  return locale === 'en' ? path : `/${locale}${path}`;
}

const H1 = { fontSize: 32, fontWeight: 700, margin: 0 } as const;
const H2 = { fontSize: 22, fontWeight: 600, marginTop: 36, marginBottom: 12 } as const;
const SUBTITLE = { color: '#555', marginTop: 12, fontSize: 16 } as const;
const BODY = { color: '#444', marginTop: 16, fontSize: 15 } as const;
const PERK_LIST = { listStyle: 'none', padding: 0, margin: '0 0 16px' } as const;
const PERK_ITEM = {
  padding: '12px 0',
  borderBottom: '1px solid #f0f0f0',
  fontSize: 14,
  color: '#333',
} as const;
const WINDOW_NOTE = {
  marginTop: 28,
  padding: '14px 16px',
  background: '#fdfaf2',
  border: '1px solid #f0e4cf',
  borderRadius: 8,
  fontSize: 13,
  color: '#7a5a18',
} as const;
const BUTTON_PRIMARY = {
  display: 'inline-block',
  padding: '12px 24px',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: 'none',
  cursor: 'pointer',
} as const;
const BUTTON_DISABLED = { ...BUTTON_PRIMARY, background: '#888', cursor: 'wait' } as const;
