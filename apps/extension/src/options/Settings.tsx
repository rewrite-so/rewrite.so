import { LOCALES, REWRITE_TARGET_LABELS, REWRITE_TARGETS } from '@rewrite/shared';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../lib/i18n.ts';
import type { UserPrefs } from '../lib/storage.ts';

interface Props {
  prefs: UserPrefs;
  onUpdate: (patch: Partial<UserPrefs>) => void;
}

// UI locale 仍只有 7 个（与 web 一致）
const UI_LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  'zh-CN': '中文（简体）',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

const PRESET_TARGETS: readonly string[] = ['auto', ...REWRITE_TARGETS];
const CUSTOM_SENTINEL = '__custom__';

export function Settings({ prefs, onUpdate }: Props) {
  const t = useT();
  const isStoredCustom = !PRESET_TARGETS.includes(prefs.targetLang);
  const [customDraft, setCustomDraft] = useState(isStoredCustom ? prefs.targetLang : '');
  const [showCustomInput, setShowCustomInput] = useState(isStoredCustom);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  // 切到 custom 时自动聚焦 input
  useEffect(() => {
    if (showCustomInput && !isStoredCustom) {
      customInputRef.current?.focus();
    }
  }, [showCustomInput, isStoredCustom]);

  // prefs 外部更新时同步 draft
  useEffect(() => {
    if (isStoredCustom) {
      setCustomDraft(prefs.targetLang);
      setShowCustomInput(true);
    }
  }, [prefs.targetLang, isStoredCustom]);

  const customOptionLabel = isStoredCustom
    ? t('core.lang.customLabelFmt').replace('{value}', prefs.targetLang)
    : t('core.lang.custom');

  const langOptions = [
    { value: 'auto', label: t('ext.options.langOption.auto') },
    ...REWRITE_TARGETS.map((code) => ({
      value: code,
      label: REWRITE_TARGET_LABELS[code],
    })),
    { value: CUSTOM_SENTINEL, label: customOptionLabel },
  ];
  const uiLocaleOptions = [
    { value: 'auto', label: t('ext.options.uiLocale.auto') },
    ...LOCALES.map((l) => ({ value: l, label: UI_LOCALE_LABELS[l] ?? l })),
  ];

  function handleLangChange(value: string) {
    if (value === CUSTOM_SENTINEL) {
      setShowCustomInput(true);
      return;
    }
    setShowCustomInput(false);
    setCustomDraft('');
    onUpdate({ targetLang: value });
  }

  function commitCustom() {
    const trimmed = customDraft.trim();
    if (trimmed.length === 0) {
      if (!isStoredCustom) {
        setShowCustomInput(false);
        setCustomDraft('');
      }
      return;
    }
    if (trimmed === prefs.targetLang) return;
    onUpdate({ targetLang: trimmed });
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t('ext.options.title')}</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>rewrite.so</p>
        </header>

        <Section title={t('ext.options.targetLang.title')}>
          <select
            value={showCustomInput || isStoredCustom ? CUSTOM_SENTINEL : prefs.targetLang}
            onChange={(e) => handleLangChange((e.target as HTMLSelectElement).value)}
            style={selectStyle}
          >
            {langOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {showCustomInput && (
            <div style={{ marginTop: 12 }}>
              <input
                ref={customInputRef}
                type="text"
                value={customDraft}
                onInput={(e) => setCustomDraft((e.target as HTMLInputElement).value)}
                onBlur={commitCustom}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder={t('core.lang.customPlaceholder')}
                maxLength={50}
                style={{ ...selectStyle, width: '100%' }}
              />
              <p style={hintStyle}>{t('core.lang.customHelp')}</p>
            </div>
          )}
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
