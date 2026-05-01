'use client';

import { createWebApiClient, mount } from '@rewrite/core';
import { pickLocale, t } from '@rewrite/shared';
import { useEffect, useRef, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8787';

export function TryClient() {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [hintVisible, setHintVisible] = useState(false);

  useEffect(() => {
    const locale = pickLocale(navigator.language);
    const apiClient = createWebApiClient({ apiBase: API_BASE });
    const handle = mount({
      host: 'web',
      apiClient,
      shadowMode: 'open',
      uiLocale: locale,
      showInstallHook: true,
      onInstallClick: () => {
        // Phase 5 接 Chrome Web Store 链接
        window.open('https://github.com/rewrite-so/rewrite.so', '_blank');
      },
      onError: (err) => {
        console.warn('[rewrite.so]', err);
      },
    });
    return () => handle.unmount();
  }, []);

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

  const navLang = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const locale = pickLocale(navLang);

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={taRef}
        defaultValue="hi, can u tell me when is the meeting tmr? i need to prep some slide before that"
        placeholder={t('placeholder.tryHere', locale)}
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
          {t('hint.doubleShift', locale)}
        </div>
      )}
    </div>
  );
}
