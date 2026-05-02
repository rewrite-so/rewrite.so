'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';

type Status = 'pending' | 'submitting' | 'done' | 'error' | 'invalid_link';

export function UnsubscribeClient({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; token?: string }>;
}) {
  const params = use(searchParams);
  const user = params.user;
  const token = params.token;

  const [status, setStatus] = useState<Status>(user && token ? 'pending' : 'invalid_link');
  const [error, setError] = useState<string | null>(null);
  const triedAutoRef = useRef(false);

  const submit = useCallback(async () => {
    if (!user || !token) return;
    setStatus('submitting');
    setError(null);
    try {
      const res = await fetch(
        `/v1/unsubscribe?user=${encodeURIComponent(user)}&token=${encodeURIComponent(token)}`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `HTTP ${res.status}`);
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch (err) {
      setError((err as Error).message);
      setStatus('error');
    }
  }, [user, token]);

  // Auto-submit once on mount when the user clicks an email link.
  // The visible button below is a fallback for retry / for spam filters
  // that fetched the URL with GET only.
  useEffect(() => {
    if (triedAutoRef.current) return;
    if (status !== 'pending') return;
    triedAutoRef.current = true;
    submit();
  }, [status, submit]);

  if (status === 'invalid_link') {
    return (
      <p style={{ marginTop: 24, color: '#666', fontSize: 14 }}>
        This link is missing required parameters. Please use the unsubscribe link from the email
        directly, or email <a href="mailto:hello@rewrite.so">hello@rewrite.so</a>.
      </p>
    );
  }
  if (status === 'submitting' || status === 'pending') {
    return <p style={{ marginTop: 24, color: '#666', fontSize: 14 }}>Unsubscribing…</p>;
  }
  if (status === 'done') {
    return (
      <div
        style={{
          marginTop: 24,
          padding: 16,
          border: '1px solid #bbf7d0',
          background: '#f0fdf4',
          borderRadius: 8,
          fontSize: 14,
          color: '#166534',
        }}
      >
        ✓ You’re unsubscribed from onboarding emails. We’re sorry to see you stop hearing from us.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 24 }}>
      <p style={{ color: '#dc2626', fontSize: 14 }}>Unsubscribe failed: {error}</p>
      <button
        type="button"
        onClick={submit}
        style={{
          marginTop: 8,
          padding: '10px 16px',
          background: '#111',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
