import { attachDoubleShift } from '@rewrite/core';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { UserPrefs } from '../lib/storage.ts';

type Step = 1 | 2 | 3;

interface Props {
  onComplete: (patch: Partial<UserPrefs>) => void;
}

const LANG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: '自动检测页面语言（推荐）' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
];

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [targetLang, setTargetLang] = useState('auto');
  const [triggered, setTriggered] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // 第一步进入时聚焦 textarea（替代 autoFocus 属性）
  useEffect(() => {
    if (step === 1) taRef.current?.focus();
  }, [step]);

  // 第一步：必须用户亲手双击 Shift 才能进下一步
  useEffect(() => {
    if (step !== 1) return;
    const handle = attachDoubleShift(window, {
      onTrigger: () => {
        setTriggered(true);
        setTimeout(() => setStep(2), 600);
      },
    });
    return () => handle.detach();
  }, [step]);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>欢迎使用 rewrite.so</h1>
          <Stepper current={step} />
        </header>

        {step === 1 && (
          <section>
            <h2 style={h2Style}>试一下双击 Shift</h2>
            <p style={pStyle}>
              在下面的输入框写点东西，然后按两下 <kbd style={kbdStyle}>Shift</kbd>
              。这是触发改写的唯一手势。
            </p>
            <textarea
              ref={taRef}
              defaultValue="hi can u tell me when is the meeting tmr"
              placeholder="试着按两下 Shift…"
              style={taStyle}
            />
            <div style={hintStyle}>
              {triggered ? (
                <span style={{ color: '#22c55e' }}>✓ 触发成功！准备好了…</span>
              ) : (
                <>
                  <kbd style={kbdStyle}>Shift</kbd>
                  <kbd style={kbdStyle}>Shift</kbd>
                  <span style={{ color: '#888', marginLeft: 6 }}>
                    （双击间隔 ≤ 500ms；不要按住）
                  </span>
                </>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 style={h2Style}>设置目标语言</h2>
            <p style={pStyle}>
              改写结果会输出为目标语言。"自动检测页面语言"适合大多数人——例如你在英文网站打中文，会自动翻成英文
              3 风格。
            </p>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang((e.target as HTMLSelectElement).value)}
              style={selectStyle}
            >
              {LANG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button type="button" style={primaryBtnStyle} onClick={() => setStep(3)}>
                下一步
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 style={h2Style}>就绪</h2>
            <p style={pStyle}>
              在任何网页输入框聚焦后，右下角会出现一个小点。双击 Shift 即可改写。试试看：
            </p>
            <ul style={{ margin: '8px 0 24px', color: '#444', paddingLeft: 20 }}>
              <li>Twitter / 推文输入框</li>
              <li>知乎 / Reddit 评论框</li>
              <li>Slack / Discord 网页消息框</li>
              <li>邮件正文（Outlook web 等）</li>
            </ul>
            <button
              type="button"
              style={primaryBtnStyle}
              onClick={() => onComplete({ targetLang })}
            >
              完成
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function Stepper({ current }: { current: Step }) {
  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 4 }}>
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          style={{
            flex: 1,
            height: 3,
            borderRadius: 2,
            background: n <= current ? '#111' : '#e4e4e7',
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
