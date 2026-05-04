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
import { useEffect, useRef, useState } from 'react';
import { Link } from '../../../../i18n/navigation.ts';

// 留空让 fetch 走 same-origin（Next rewrites 代理到 wrangler dev）
// 这样 better-auth session cookie 是 web origin 的，不需跨域
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

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
        // Phase 5 接 Chrome Web Store 链接
        window.open('https://github.com/rewrite-so/rewrite.so', '_blank');
      },
      onOpenSettings: () => {
        window.open('/settings', '_blank');
      },
      onError: (err) => {
        console.warn('[rewrite.so]', err);
      },
      // 用户接受候选改写后递增计数。触发"登录解锁更多"nudge 显示。
      // 仅在 onSelect 真正成功（panel close + editable 替换）后 fire，
      // abort / Esc / 失败的改写不算。localStorage 持久化在独立 effect
      // 里 watch rewriteCount——避免在 React updater 里做 side effect
      onAccepted: () => {
        setRewriteCount((n) => n + 1);
      },
    });
    return () => handle.unmount();
  }, [locale, targetLang]);

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
