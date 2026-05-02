import { describe, expect, it } from 'vitest';
import { decryptApiKey, encryptApiKey } from './crypto.ts';

// 32 zero bytes, base64-encoded（仅测试用）
const ZERO_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

describe('encryptApiKey + decryptApiKey', () => {
  it('round-trips a typical OpenAI key', async () => {
    const plain = 'sk-1234567890abcdef1234567890abcdef';
    const enc = await encryptApiKey(plain, ZERO_KEY);
    const dec = await decryptApiKey(enc.encrypted, enc.iv, ZERO_KEY);
    expect(dec).toBe(plain);
  });

  it('returns mask = last 4 chars', async () => {
    const enc = await encryptApiKey('sk-secrettoken1234', ZERO_KEY);
    expect(enc.mask).toBe('1234');
  });

  it('returns full key as mask if key length <= 4', async () => {
    const enc = await encryptApiKey('abc', ZERO_KEY);
    expect(enc.mask).toBe('abc');
  });

  it('produces different IV each call', async () => {
    const a = await encryptApiKey('same-key', ZERO_KEY);
    const b = await encryptApiKey('same-key', ZERO_KEY);
    expect(a.iv).not.toBe(b.iv);
    expect(a.encrypted).not.toBe(b.encrypted);
  });

  it('rejects tampered ciphertext', async () => {
    const enc = await encryptApiKey('hello', ZERO_KEY);
    // flip last byte
    const tampered = `${enc.encrypted.slice(0, -2)}AA`;
    await expect(decryptApiKey(tampered, enc.iv, ZERO_KEY)).rejects.toBeDefined();
  });

  it('rejects wrong master key', async () => {
    const enc = await encryptApiKey('hello', ZERO_KEY);
    const otherKey = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBA=';
    await expect(decryptApiKey(enc.encrypted, enc.iv, otherKey)).rejects.toBeDefined();
  });

  it('rejects master key of wrong length', async () => {
    await expect(encryptApiKey('x', 'AAAA')).rejects.toThrow(/32 bytes/);
  });

  it('rejects empty plain', async () => {
    await expect(encryptApiKey('', ZERO_KEY)).rejects.toThrow(/empty/);
  });
});
