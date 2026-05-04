import type { ComponentChildren } from 'preact';
import { WEB_BASE } from '../lib/config.ts';
import { useT } from '../lib/i18n.ts';
import type { MeUser } from '../lib/me.ts';
import type { UserPrefs } from '../lib/storage.ts';

interface Props {
  prefs: UserPrefs;
  user: MeUser;
  tier: 'free' | 'pro';
  onUpdate: (patch: Partial<UserPrefs>) => void;
}

/**
 * 登录用户的 options 简化视图：targetLang / uiLocale 编辑入口在 web /settings；
 * 扩展只保留 triggerEnabled 这一项扩展行为本地开关。
 *
 * 设计动机：登录用户在 web 改了偏好后，extension chrome.storage 副本可能没及时
 * 同步（fetchCloudPrefs 仅在 options mount 时拉一次，且 cookie 跨站偶有边角失败）；
 * 让 web 成为唯一真相源避免"看起来不一致"。chrome.storage 的 targetLang 仍由
 * SSE meta.userTargetLang 在每次 rewrite 时反向同步，但用户看不到副本 ≠ 没有副本。
 */
export function LoggedInSettings({ prefs, user, tier, onUpdate }: Props) {
  const t = useT();
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{t('ext.options.title')}</h1>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 13 }}>rewrite.so</p>
        </header>

        <Section title={t('ext.options.loggedIn.title')}>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#111' }}>
            {t('ext.options.loggedIn.signedInAs').replace('{email}', user.email)}
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#888' }}>
            {tier === 'pro'
              ? t('ext.options.loggedIn.tierPro')
              : t('ext.options.loggedIn.tierFree')}
          </p>
          <p style={hintStyle}>{t('ext.options.loggedIn.hint')}</p>
          <a href={`${WEB_BASE}/settings`} target="_blank" rel="noopener" style={linkBtnStyle}>
            {t('ext.options.loggedIn.manage')}
          </a>
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
const hintStyle = { margin: '8px 0 12px', color: '#666', fontSize: 12, lineHeight: 1.5 };
const linkBtnStyle = {
  display: 'inline-block',
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 500,
  color: '#fff',
  background: '#111',
  borderRadius: 6,
  textDecoration: 'none',
};
