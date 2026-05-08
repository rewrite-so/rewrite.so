import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Link } from '../i18n/navigation.ts';
import { getExtensionInstallUrl } from '../lib/extension-install-url.ts';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';

const NAV_LINK = {
  fontSize: 14,
  color: '#444',
  textDecoration: 'none',
  padding: '6px 10px',
};

const NAV_LINK_PRIMARY = {
  fontSize: 14,
  color: '#fff',
  background: '#111',
  textDecoration: 'none',
  padding: '7px 14px',
  borderRadius: 6,
  fontWeight: 500,
};

const NAV_LINK_OUTLINE = {
  fontSize: 14,
  color: '#111',
  background: '#fff',
  textDecoration: 'none',
  padding: '6px 13px',
  borderRadius: 6,
  border: '1px solid #111',
  fontWeight: 500,
};

interface MeUser {
  id: string;
  email: string;
  name?: string | null;
}

/**
 * SSR 读 session：从 web 入站 cookie 转发到 api 的 /v1/me。
 *
 * - dev: web localhost:3000 → api localhost:8787，cookie 同 host 透传
 * - prod: web rewrite.so → api api.rewrite.so，session cookie domain `.rewrite.so` 共享
 *
 * cache: 'no-store' 必填——session 不能被静态化。
 * 失败时（cookie 不全 / 网络 / api 5xx）返 null，UI 退到匿名态——绝不阻塞渲染。
 */
async function getCurrentUser(): Promise<MeUser | null> {
  try {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    if (!cookieHeader) return null;
    const apiBase = process.env.API_BASE_URL ?? 'http://localhost:8787';
    const res = await fetch(`${apiBase}/v1/me`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: MeUser | null };
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function TopNav() {
  const t = await getTranslations('nav');
  const user = await getCurrentUser();
  const isAuthed = user !== null;

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'saturate(180%) blur(8px)',
        WebkitBackdropFilter: 'saturate(180%) blur(8px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 4,
        }}
      >
        {/* Brand */}
        <Link
          href="/"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#111',
            textDecoration: 'none',
            marginRight: 24,
            letterSpacing: 0,
          }}
        >
          rewrite.so
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              verticalAlign: 'super',
              marginLeft: 1,
              color: '#888',
            }}
          >
            ™
          </span>
        </Link>

        {/* Center links */}
        <div style={{ display: 'flex', gap: 4, flex: '1 1 220px', flexWrap: 'wrap', minWidth: 0 }}>
          <Link href="/try" style={NAV_LINK}>
            {t('try')}
          </Link>
          <Link href="/pricing" style={NAV_LINK}>
            {t('pricing')}
          </Link>
          <a
            href="https://github.com/rewrite-so/rewrite.so"
            style={NAV_LINK}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('github')}
          </a>
        </div>

        {/* Right: language switcher + CTAs（按登录态分支） */}
        <LanguageSwitcher />
        {isAuthed ? (
          <>
            <a
              href={getExtensionInstallUrl()}
              style={{ ...NAV_LINK_OUTLINE, marginLeft: 8 }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('install')}
            </a>
            <Link href="/settings" style={{ ...NAV_LINK_PRIMARY, marginLeft: 8 }}>
              {t('settings')}
            </Link>
          </>
        ) : (
          <>
            <Link href="/login" style={{ ...NAV_LINK, marginLeft: 4 }}>
              {t('signIn')}
            </Link>
            <a
              href={getExtensionInstallUrl()}
              style={{ ...NAV_LINK_OUTLINE, marginLeft: 8 }}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('install')}
            </a>
            <Link href="/try" style={{ ...NAV_LINK_PRIMARY, marginLeft: 8 }}>
              {t('tryFree')}
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
