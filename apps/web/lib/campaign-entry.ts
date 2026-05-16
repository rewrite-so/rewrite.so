import { cache } from 'react';

/**
 * SSR helper for "should we show this campaign's entry surfaces (homepage
 * badge + TopNav link)?".
 *
 * Two orthogonal toggles on the api `campaigns` row drive this:
 * - `enabled` + time window → `active` (also gates URL direct-access at api)
 * - `show_homepage_badge` → marketing exposure on web surfaces
 *
 * `showBadge = active && show_homepage_badge`. The TopNav link and the
 * homepage Hero badge both render on `showBadge`, so they stay locked
 * together — there is no in-between state where one is visible and the
 * other isn't.
 *
 * Wrapped with React.cache() so that calling this twice within the same
 * SSR request (TopNav + page.tsx) hits the api once. We use cache:
 * 'no-store' below, which disables Next's default fetch dedupe, so
 * React.cache() is doing the actual de-duplication.
 */
export interface CampaignEntryState {
  active: boolean;
  showBadge: boolean;
}

interface CampaignSummary {
  enabled?: boolean;
  show_homepage_badge?: boolean;
  starts_at?: number;
  ends_at?: number;
}

export const getCampaignEntryState = cache(async (slug: string): Promise<CampaignEntryState> => {
  const apiBase = process.env.API_BASE_URL ?? 'http://localhost:8787';
  try {
    const res = await fetch(`${apiBase}/v1/campaigns/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return { active: false, showBadge: false };
    const data = (await res.json()) as CampaignSummary;
    if (!data.enabled) return { active: false, showBadge: false };
    const now = Date.now();
    if (data.starts_at && now < data.starts_at) return { active: false, showBadge: false };
    if (data.ends_at && now > data.ends_at) return { active: false, showBadge: false };
    const active = true;
    const showBadge = active && data.show_homepage_badge === true;
    return { active, showBadge };
  } catch {
    // Any error → fail-closed (don't show entry surfaces). The api dropping
    // requests shouldn't make the homepage flash a campaign teaser that
    // can't accept signups.
    return { active: false, showBadge: false };
  }
});
