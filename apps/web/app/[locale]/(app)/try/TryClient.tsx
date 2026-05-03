'use client';

import { createWebApiClient, mount } from '@rewrite/core';
import {
  type Locale,
  REWRITE_TARGET_LABELS,
  REWRITE_TARGETS,
  type RewriteTarget,
} from '@rewrite/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

// 留空让 fetch 走 same-origin（Next rewrites 代理到 wrangler dev）
// 这样 better-auth session cookie 是 web origin 的，不需跨域
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '';

const TARGET_LANG_STORAGE = 'rewrite-so-try-target-lang-v1';

export function TryClient() {
  const locale = useLocale() as Locale;
  const t = useTranslations();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  // 试用页**始终默认英语**作为目标——不用 auto。
  // 用户切换的偏好持久到 localStorage（仅影响 /try，不影响登录用户的 settings）。
  const [targetLang, setTargetLang] = useState<RewriteTarget>('en');
  // 扩展存在感：扩展的 sentinel.ts 在 document_start 给 <html> 设这个 data-attr。
  // 已装扩展时跳过 web 自己的 mount()，避免双 keydown listener / 双配额扣减。
  const [extensionDetected, setExtensionDetected] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(TARGET_LANG_STORAGE);
    if (stored && (REWRITE_TARGETS as readonly string[]).includes(stored)) {
      setTargetLang(stored as RewriteTarget);
    }
    // sentinel 在 document_start 注入，此时一定已设置好（React useEffect 比 document_start 晚）
    setExtensionDetected(
      document.documentElement.getAttribute('data-rewrite-so-extension') === '1',
    );
  }, []);

  useEffect(() => {
    // 已装扩展时不 mount —— 让扩展接管 keydown / 浮层
    if (extensionDetected) return;
    const apiClient = createWebApiClient({ apiBase: API_BASE });
    const handle = mount({
      host: 'web',
      apiClient,
      shadowMode: 'open',
      uiLocale: locale,
      userPrefLang: targetLang,
      showInstallHook: true,
      loginUrl: '/login',
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
    });
    return () => handle.unmount();
  }, [locale, targetLang, extensionDetected]);

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
      {extensionDetected && (
        <div
          role="status"
          style={{
            padding: '12px 16px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.55,
            color: '#1e3a8a',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {t('page.try.extensionTakeoverTitle')}
          </div>
          <div>{t('page.try.extensionTakeoverBody')}</div>
        </div>
      )}
      {!extensionDetected && (
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
      )}
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
    </div>
  );
}
