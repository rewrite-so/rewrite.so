'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { track } from '../../../../lib/analytics.ts';
import styles from './Login.module.css';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginClient() {
  const t = useTranslations('page.login');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setError(null);
    track('signin_attempt', { method: 'magiclink' });

    try {
      // callbackURL 必须是绝对 URL 指向 web origin（dev: localhost:3000, prod: rewrite.so）。
      // better-auth 默认会把相对路径拼到 baseURL（api origin），那里没有 web 路由 → 404。
      const res = await fetch('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          // signin=success lets the destination page detect the sign-in
          // completion vs. a plain reload and emit a one-shot signin_success
          // event (see SettingsClient).
          callbackURL: `${window.location.origin}/settings?signin=success`,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
      }
      // 'sent' = the magic-link email has been dispatched; the user still has
      // to click it. We emit signin_success on the destination page (settings)
      // when the SDK resumes after redirect, not here.
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }

  if (status === 'sent') {
    return (
      <div className={styles.sent}>
        <p className={styles.sentLine1}>{t('sentLine1', { email })}</p>
        <p className={styles.sentLine2}>{t('sentLine2')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={styles.form}>
      <input
        type="email"
        required
        autoComplete="email"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={t('emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.currentTarget.value)}
        className={styles.input}
      />
      <button type="submit" disabled={status === 'sending'} className={styles.submit}>
        {status === 'sending' ? t('submitting') : t('submit')}
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </form>
  );
}
