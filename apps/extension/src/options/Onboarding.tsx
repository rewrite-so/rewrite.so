import { attachDoubleShift } from '@rewrite/core';
import { REWRITE_TARGET_LABELS, REWRITE_TARGETS } from '@rewrite/shared';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../lib/i18n.ts';
import type { UserPrefs } from '../lib/storage.ts';

type Step = 1 | 2 | 3;

interface Props {
  onComplete: (patch: Partial<UserPrefs>) => void;
  /**
   * 已登录：跳过 step 2（语言选择）—— 偏好在 web /settings 管理，本地选只会被
   * inject.ts bootstrap 的 fetchCloudPrefs() 或 SSE meta.userTargetLang 反向覆盖。
   */
  authed: boolean;
}

export function Onboarding({ onComplete, authed }: Props) {
  const t = useT();
  const [step, setStep] = useState<Step>(1);
  const [targetLang, setTargetLang] = useState('auto');
  const [triggered, setTriggered] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // onboarding 简化：22 个预设；不暴露 Custom 入口（用户首次使用时不应该被复杂选项压住，
  // 完整 22 + Custom 在 Settings 里）
  const langOptions = [
    { value: 'auto', label: t('ext.options.langOption.auto') },
    ...REWRITE_TARGETS.map((code) => ({
      value: code,
      label: REWRITE_TARGET_LABELS[code],
    })),
  ];

  // 第一步进入时聚焦 textarea
  useEffect(() => {
    if (step === 1) taRef.current?.focus();
  }, [step]);

  // 第一步：必须用户亲手双击 Shift 才能进下一步
  useEffect(() => {
    if (step !== 1) return;
    const handle = attachDoubleShift(window, {
      onTrigger: () => {
        setTriggered(true);
        setTimeout(() => setStep(authed ? 3 : 2), 600);
      },
    });
    return () => handle.detach();
  }, [step, authed]);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t('ext.onboarding.header')}</h1>
          <Stepper current={step} authed={authed} />
        </header>

        {step === 1 && (
          <section>
            <h2 style={h2Style}>{t('ext.onboarding.step1.title')}</h2>
            <p style={pStyle}>{t('ext.onboarding.step1.body')}</p>
            <textarea
              ref={taRef}
              defaultValue="hi can u tell me when is the meeting tmr"
              placeholder={t('ext.onboarding.step1.placeholder')}
              style={taStyle}
            />
            <div style={hintStyle}>
              {triggered ? (
                <span style={{ color: '#22c55e' }}>{t('ext.onboarding.step1.success')}</span>
              ) : (
                <>
                  <kbd style={kbdStyle}>Shift</kbd>
                  <kbd style={kbdStyle}>Shift</kbd>
                  <span style={{ color: '#888', marginLeft: 6 }}>
                    {t('ext.onboarding.step1.hint')}
                  </span>
                </>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 style={h2Style}>{t('ext.onboarding.step2.title')}</h2>
            <p style={pStyle}>{t('ext.onboarding.step2.body')}</p>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang((e.target as HTMLSelectElement).value)}
              style={selectStyle}
            >
              {langOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#888', lineHeight: 1.55 }}>
              {t('ext.onboarding.step2.customHint')}
            </p>
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button type="button" style={primaryBtnStyle} onClick={() => setStep(3)}>
                {t('ext.onboarding.step2.next')}
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 style={h2Style}>{t('ext.onboarding.step3.title')}</h2>
            <p style={pStyle}>{t('ext.onboarding.step3.body')}</p>
            <ul style={{ margin: '8px 0 24px', color: '#444', paddingLeft: 20 }}>
              <li>{t('ext.onboarding.step3.example1')}</li>
              <li>{t('ext.onboarding.step3.example2')}</li>
              <li>{t('ext.onboarding.step3.example3')}</li>
              <li>{t('ext.onboarding.step3.example4')}</li>
            </ul>
            <button
              type="button"
              style={primaryBtnStyle}
              onClick={() => onComplete(authed ? {} : { targetLang })}
            >
              {t('ext.onboarding.step3.done')}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function Stepper({ current, authed }: { current: Step; authed: boolean }) {
  // 已登录跳过 step 2（语言选择），整体只 2 段；step 1 = 段 1，step 3 = 段 2
  const total = authed ? 2 : 3;
  const visualCurrent = authed && current === 3 ? 2 : current;
  const segments = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 4 }}>
      {segments.map((n) => (
        <div
          key={n}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: n <= visualCurrent ? '#111' : '#e4e4e7',
          }}
        />
      ))}
    </div>
  );
}

const pageStyle = {
  minHeight: '100vh',
  background: '#fafafa',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '64px 24px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
};
const shellStyle = {
  width: 540,
  background: '#fff',
  border: '1px solid #e4e4e7',
  borderRadius: 12,
  padding: 32,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const h2Style = { margin: '0 0 8px', fontSize: 16, fontWeight: 600 };
const pStyle = { margin: '0 0 16px', color: '#444', fontSize: 14, lineHeight: 1.55 };
const taStyle = {
  width: '100%',
  minHeight: 80,
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid #d4d4d8',
  borderRadius: 8,
  outline: 'none',
  resize: 'vertical' as const,
  fontFamily: 'inherit',
  boxSizing: 'border-box' as const,
};
const hintStyle = {
  marginTop: 12,
  fontSize: 13,
  color: '#666',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
const kbdStyle = {
  display: 'inline-block',
  padding: '1px 6px',
  border: '1px solid #d4d4d8',
  borderRadius: 4,
  fontSize: 11,
  fontFamily: 'inherit',
  background: '#fff',
};
const selectStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid #d4d4d8',
  borderRadius: 8,
  fontFamily: 'inherit',
  background: '#fff',
};
const primaryBtnStyle = {
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 500,
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};
