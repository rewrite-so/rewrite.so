import type { ComponentChildren } from 'preact';
import type { UserPrefs } from '../lib/storage.ts';

interface Props {
  prefs: UserPrefs;
  onUpdate: (patch: Partial<UserPrefs>) => void;
}

const LANG_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'auto', label: '自动检测页面语言' },
  { value: 'en', label: 'English' },
  { value: 'zh-CN', label: '中文（简体）' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
];

const UI_LOCALE_OPTIONS: Array<{ value: UserPrefs['uiLocale']; label: string }> = [
  { value: 'auto', label: '跟随浏览器语言' },
  { value: 'zh-CN', label: '中文' },
  { value: 'en', label: 'English' },
];

export function Settings({ prefs, onUpdate }: Props) {
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>设置</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>rewrite.so</p>
        </header>

        <Section title="目标语言">
          <select
            value={prefs.targetLang}
            onChange={(e) => onUpdate({ targetLang: (e.target as HTMLSelectElement).value })}
            style={selectStyle}
          >
            {LANG_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p style={hintStyle}>
            "自动检测页面语言"会根据当前网站推断目标语言。例如在英文网站输入中文 → 自动翻成英文 3
            风格。
          </p>
        </Section>

        <Section title="界面语言">
          <select
            value={prefs.uiLocale}
            onChange={(e) =>
              onUpdate({ uiLocale: (e.target as HTMLSelectElement).value as UserPrefs['uiLocale'] })
            }
            style={selectStyle}
          >
            {UI_LOCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Section>

        <Section title="启用双击 Shift">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={prefs.triggerEnabled}
              onChange={(e) => onUpdate({ triggerEnabled: (e.target as HTMLInputElement).checked })}
            />
            <span>在输入框启用快捷键触发</span>
          </label>
          <p style={hintStyle}>关闭后小点不再显示，双击 Shift 也不会触发。</p>
        </Section>

        <Section title="BYOK · 自带 API key">
          <p style={hintStyle}>
            Pro 功能，在 Phase 4 启用。届时此处会出现 base_url / model / key 字段。
          </p>
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={h2Style}>{title}</h2>
      {children}
    </section>
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
const h2Style = { margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#111' };
const hintStyle = { margin: '8px 0 0', color: '#888', fontSize: 12, lineHeight: 1.5 };
const selectStyle = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: '1px solid #d4d4d8',
  borderRadius: 8,
  fontFamily: 'inherit',
  background: '#fff',
};
