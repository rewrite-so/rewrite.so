'use client';

import { useState } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginClient() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    setError(null);

    try {
      // callbackURL 必须是绝对 URL 指向 web origin（dev: localhost:3000, prod: rewrite.so）。
      // better-auth 默认会把相对路径拼到 baseURL（api origin），那里没有 web 路由 → 404。
      const res = await fetch('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: email.trim(),
          callbackURL: `${window.location.origin}/settings`,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
      }
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError((err as Error).message);
    }
  }

  if (status === 'sent') {
    return (
      <div style={{ marginTop: 28, padding: 16, border: '1px solid #d4d4d8', borderRadius: 10 }}>
        <p style={{ margin: 0, fontSize: 14 }}>
          ✓ Login link sent to <code>{email}</code>.
        </p>
        <p style={{ margin: '8px 0 0', color: '#888', fontSize: 12 }}>
          Check your inbox (and spam folder). Click the &ldquo;Sign in to rewrite.so&rdquo; button.
          The link is valid for 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={{ marginTop: 24 }}>
      <input
        type="email"
        required
        autoComplete="email"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.currentTarget.value)}
        style={{
          width: '100%',
          padding: '12px 14px',
          fontSize: 14,
          border: '1px solid #d4d4d8',
          borderRadius: 8,
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
      <button
        type="submit"
        disabled={status === 'sending'}
        style={{
          width: '100%',
          marginTop: 12,
          padding: '12px 16px',
          fontSize: 14,
          fontWeight: 500,
          background: status === 'sending' ? '#444' : '#111',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: status === 'sending' ? 'wait' : 'pointer',
        }}
      >
        {status === 'sending' ? 'Sending…' : 'Send login link'}
      </button>
      {error && <p style={{ marginTop: 12, color: '#dc2626', fontSize: 13 }}>{error}</p>}
    </form>
  );
}
