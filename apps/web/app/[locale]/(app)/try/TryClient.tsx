'use client';

import { createWebApiClient, mount } from '@rewrite/core';
import {
  type Locale,
  QUOTA,
  REWRITE_TARGET_LABELS,
  REWRITE_TARGETS,
  type RewriteTarget,
} from '@rewrite/shared';
import { useLocale, useTranslations } from 'next-intl';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../../../../i18n/navigation.ts';
import { track } from '../../../../lib/analytics.ts';
import { getExtensionInstallUrl } from '../../../../lib/extension-install-url.ts';

// 留空让 fetch 走 same-origin（Next rewrites 代理到 wrangler dev）
// 这样 better-auth session cookie 是 web origin 的，不需跨域
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

const TARGET_LANG_STORAGE = 'rewrite-so-try-target-lang-v1';
// /try 上累计的成功改写次数，跨 session 持久化。仅匿名用户用作转化 nudge
// 触发条件——已登录用户 fetch /v1/me 后隐藏。
const REWRITES_KEY = '__rewrite_so_try_rewrites_v1';

export function TryClient() {
  const locale = useLocale() as Locale;
  const t = useTranslations();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  // 试用页**始终默认英语**作为目标——不用 auto。
  // 用户切换的偏好持久到 localStorage（仅影响 /try，不影响登录用户的 settings）。
  const [targetLang, setTargetLang] = useState<RewriteTarget>('en');
  // 转化 nudge 状态：rewriteCount 来自 localStorage 持久；authed 三态
  // （null=fetching / true=登录 / false=匿名）—— 仅 false 时显示 nudge，
  // 避免登录用户在 /v1/me 探测期间闪现错误的 "sign in"
  const [rewriteCount, setRewriteCount] = useState(0);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const { containerRef: turnstileRef, getTurnstileToken } = useTurnstileToken(TURNSTILE_SITE_KEY);

  useEffect(() => {
    const stored = window.localStorage.getItem(TARGET_LANG_STORAGE);
    if (stored && (REWRITE_TARGETS as readonly string[]).includes(stored)) {
      setTargetLang(stored as RewriteTarget);
    }
    // 读累计计数 + 探测登录态
    try {
      const n = Number(window.localStorage.getItem(REWRITES_KEY) ?? 0);
      if (Number.isFinite(n) && n > 0) setRewriteCount(n);
    } catch {
      /* localStorage 不可用 */
    }
    fetch('/v1/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { user: unknown }) => setAuthed(d?.user != null))
      .catch(() => setAuthed(false));
  }, []);

  // rewriteCount 变化时持久化到 localStorage（独立 effect 避免在 React
  // setState updater 里做 side effect；StrictMode 下 updater 可能双调用）
  useEffect(() => {
    if (rewriteCount === 0) return; // 初始化时不写
    try {
      window.localStorage.setItem(REWRITES_KEY, String(rewriteCount));
    } catch {
      /* localStorage 不可用 */
    }
  }, [rewriteCount]);

  useEffect(() => {
    // 注：扩展不在 rewrite.so 自家域工作（manifest exclude_matches），所以
    // /try 永远是 web 端这一份 mount —— 装扩展的用户在 /try 也是"试用"体验。
    const apiClient = createWebApiClient({ apiBase: API_BASE });
    const handle = mount({
      host: 'web',
      apiClient,
      shadowMode: 'open',
      uiLocale: locale,
      userPrefLang: targetLang,
      showInstallHook: true,
      loginUrl: '/login',
      // 超配额 CTA 跳 /billing（营销页直接列定价/Subscribe 按钮），不跳 /settings 配置页
      upgradeUrl: '/billing?from=quota_exceeded',
      onInstallClick: () => {
        track('cta_click', { cta: 'install' });
        window.open(getExtensionInstallUrl(), '_blank');
      },
      getTurnstileToken,
      onOpenSettings: () => {
        window.open('/settings', '_blank');
      },
      onError: (err) => {
        console.warn('[rewrite.so]', err);
      },
      // 用户接受候选改写后递增计数。触发"登录解锁更多"nudge 显示。
      // 仅在 onSelect 真正成功（panel close + editable 替换）后 fire，
      // abort / Esc / 失败的改写不算。localStorage 持久化在独立 effect
      // 里 watch rewriteCount——避免在 React updater 里做 side effect。
      //
      // try_select_candidate is the closest analytics signal we can emit
      // without expanding @rewrite/core's mount() hook surface. position
      // and was_regen would need new hook params and a matching wire-up
      // on the extension side; that's left for a future commit.
      onAccepted: (style) => {
        setRewriteCount((n) => n + 1);
        track('try_select_candidate', { style });
      },
    });
    return () => handle.unmount();
  }, [getTurnstileToken, locale, targetLang]);

  useEffect(() => {
    // 首次访问 hint 兜底（输入框聚焦后显示，触发过一次后消失）
    const seen = window.localStorage.getItem('rewrite-so-tried-v1');
    if (seen) return;
    const ta = taRef.current;
    if (!ta) return;

    const onFocus = () => setHintVisible(true);
    const onTrigger = () => {
      window.localStorage.setItem('rewrite-so-tried-v1', '1');
      setHintVisible(false);
    };

    let lastShiftAt = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Shift' || e.repeat) return;
      const now = performance.now();
      if (now - lastShiftAt <= 500) onTrigger();
      lastShiftAt = now;
    };

    ta.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      ta.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  function onTargetLangChange(value: RewriteTarget) {
    setTargetLang(value);
    window.localStorage.setItem(TARGET_LANG_STORAGE, value);
  }

  return (
    <div style={{ position: 'relative' }}>
      {TURNSTILE_SITE_KEY && (
        <div
          ref={turnstileRef}
          style={{
            position: 'absolute',
            left: -10000,
            top: 0,
            width: 1,
            height: 1,
            overflow: 'hidden',
          }}
        />
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
          fontSize: 13,
          color: '#555',
        }}
      >
        <label htmlFor="try-target-lang" style={{ fontWeight: 500 }}>
          {t('page.try.targetLangLabel')}
        </label>
        <select
          id="try-target-lang"
          value={targetLang}
          onChange={(e) => onTargetLangChange(e.currentTarget.value as RewriteTarget)}
          style={{
            padding: '6px 10px',
            fontSize: 13,
            border: '1px solid #d4d4d8',
            borderRadius: 6,
            background: '#fff',
            fontFamily: 'inherit',
          }}
        >
          {REWRITE_TARGETS.map((l) => (
            <option key={l} value={l}>
              {REWRITE_TARGET_LABELS[l]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        ref={taRef}
        defaultValue="hi, can u tell me when is the meeting tmr? i need to prep some slide before that"
        placeholder={t('placeholder.tryHere')}
        style={{
          width: '100%',
          minHeight: 180,
          padding: '14px 16px',
          fontSize: 15,
          lineHeight: 1.55,
          border: '1px solid #d4d4d8',
          borderRadius: 12,
          outline: 'none',
          resize: 'vertical',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
      {hintVisible && (
        <div
          aria-hidden="true"
          style={{
            marginTop: 10,
            fontSize: 13,
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <kbd
            style={{
              padding: '1px 6px',
              border: '1px solid #d4d4d8',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'inherit',
            }}
          >
            Shift
          </kbd>
          <kbd
            style={{
              padding: '1px 6px',
              border: '1px solid #d4d4d8',
              borderRadius: 4,
              fontSize: 11,
              fontFamily: 'inherit',
            }}
          >
            Shift
          </kbd>
          {t('hint.doubleShift')}
        </div>
      )}
      {rewriteCount > 0 && authed === false && <TryNudge count={rewriteCount} />}
    </div>
  );
}

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      size: 'invisible';
      callback: (token: string) => void;
      'error-callback': () => void;
      'expired-callback': () => void;
    },
  ) => string | number;
  execute: (widgetId: string) => void;
  reset?: (widgetId: string) => void;
  remove?: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let turnstileLoader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (turnstileLoader) return turnstileLoader;

  turnstileLoader = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.getElementById('rewrite-so-turnstile');
    const finish = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('turnstile_unavailable'));
    };
    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => reject(new Error('turnstile_load_failed')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'rewrite-so-turnstile';
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('turnstile_load_failed')), {
      once: true,
    });
    document.head.appendChild(script);
  }).catch((err) => {
    turnstileLoader = null;
    throw err;
  });

  return turnstileLoader;
}

function useTurnstileToken(siteKey: string): {
  containerRef: RefObject<HTMLDivElement | null>;
  getTurnstileToken: () => Promise<string | undefined>;
} {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingRef = useRef<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
    timeoutId: number;
  } | null>(null);

  const rejectPending = useCallback((message: string) => {
    const pending = pendingRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingRef.current = null;
    pending.reject(new Error(message));
  }, []);

  const renderWidget = useCallback(async (): Promise<string | null> => {
    if (!siteKey) return null;
    if (widgetIdRef.current) return widgetIdRef.current;
    const api = await loadTurnstile();
    const container = containerRef.current;
    if (!container) throw new Error('turnstile_container_missing');

    const widgetId = String(
      api.render(container, {
        sitekey: siteKey,
        size: 'invisible',
        callback: (token) => {
          const pending = pendingRef.current;
          if (!pending) return;
          window.clearTimeout(pending.timeoutId);
          pendingRef.current = null;
          pending.resolve(token);
        },
        'error-callback': () => rejectPending('turnstile_failed'),
        'expired-callback': () => rejectPending('turnstile_expired'),
      }),
    );
    widgetIdRef.current = widgetId;
    return widgetId;
  }, [rejectPending, siteKey]);

  useEffect(() => {
    if (!siteKey) return;
    void renderWidget().catch(() => undefined);
    return () => {
      rejectPending('turnstile_unmounted');
      const widgetId = widgetIdRef.current;
      if (widgetId && window.turnstile?.remove) {
        window.turnstile.remove(widgetId);
      }
      widgetIdRef.current = null;
    };
  }, [rejectPending, renderWidget, siteKey]);

  const getTurnstileToken = useCallback(async (): Promise<string | undefined> => {
    if (!siteKey) return undefined;
    const api = await loadTurnstile();
    const widgetId = await renderWidget();
    if (!widgetId) return undefined;

    rejectPending('turnstile_replaced');
    return new Promise<string>((resolve, reject) => {
      pendingRef.current = {
        resolve,
        reject,
        timeoutId: window.setTimeout(() => {
          rejectPending('turnstile_timeout');
        }, 10000),
      };
      api.reset?.(widgetId);
      api.execute(widgetId);
    });
  }, [rejectPending, renderWidget, siteKey]);

  return { containerRef, getTurnstileToken };
}

function TryNudge({ count }: { count: number }) {
  const t = useTranslations('page.try');
  // 故意**不加** role="status"——它隐式带 aria-live="polite"，每次 count
  // +1 屏幕阅读器都会重新播报，对做多次改写的用户是噪音。这是底部的静态
  // 引导文字，screen reader 用户 tab 到时自然读出
  return (
    <p
      style={{
        marginTop: 14,
        fontSize: 13,
        color: '#666',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ color: '#16a34a', fontWeight: 600 }} aria-hidden="true">
        ✓
      </span>
      {t('nudge', { count })}{' '}
      <Link href="/login" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>
        {t('nudgeCta', { signupQuota: QUOTA.loggedInFree })}
      </Link>
    </p>
  );
}
