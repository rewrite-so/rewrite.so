import { LOCALES } from '@rewrite/shared';
import type { ComponentChildren } from 'preact';
import { useT } from '../lib/i18n.ts';
import type { UserPrefs } from '../lib/storage.ts';

interface Props {
  prefs: UserPrefs;
  onUpdate: (patch: Partial<UserPrefs>) => void;
}

const LANG_LABELS: Record<string, string> = {
  en: 'English',
  'zh-CN': '中文（简体）',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

export function Settings({ prefs, onUpdate }: Props) {
  const t = useT();
  const langOptions = [
    { value: 'auto', label: t('ext.options.langOption.auto') },
    ...LOCALES.map((l) => ({ value: l, label: LANG_LABELS[l] ?? l })),
  ];
  const uiLocaleOptions = [
    { value: 'auto', label: t('ext.options.uiLocale.auto') },
    ...LOCALES.map((l) => ({ value: l, label: LANG_LABELS[l] ?? l })),
  ];
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t('ext.options.title')}</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>rewrite.so</p>
        </header>

        <Section title={t('ext.options.targetLang.title')}>
          <select
            value={prefs.targetLang}
            onChange={(e) => onUpdate({ targetLang: (e.target as HTMLSelectElement).value })}
            style={selectStyle}
          >
            {langOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p style={hintStyle}>{t('ext.options.targetLang.hint')}</p>
        </Section>

        <Section title={t('ext.options.uiLocale.title')}>
          <select
            value={prefs.uiLocale}
            onChange={(e) =>
              onUpdate({ uiLocale: (e.target as HTMLSelectElement).value as UserPrefs['uiLocale'] })
            }
            style={selectStyle}
          >
            {uiLocaleOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Section>

        <Section title={t('ext.options.trigger.title')}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              checked={prefs.triggerEnabled}
              onChange={(e) => onUpdate({ triggerEnabled: (e.target as HTMLInputElement).checked })}
            />
            <span>{t('ext.options.trigger.label')}</span>
          </label>
          <p style={hintStyle}>{t('ext.options.trigger.hint')}</p>
        </Section>

        <Section title={t('ext.options.byok.title')}>
          <p style={hintStyle}>{t('ext.options.byok.placeholder')}</p>
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
