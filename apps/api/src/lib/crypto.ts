/**
 * BYOK API key 加解密。
 *
 * 算法：AES-GCM 256-bit。每次加密随机 12 字节 IV。密文 + tag 一起 base64 存。
 *
 * MASTER_KEY 配置约定：BYOK_MASTER_KEY 是 base64 编码的 32 字节密钥（256 bit）。
 * 生成：`openssl rand -base64 32`。改 master key 时所有用户的 byok_keys 都会失效——
 * 数据库 byok_keys.key_version 字段保留是为了将来支持多 key 轮换，MVP 只用 v=1。
 */

const ALG = 'AES-GCM';
const IV_LEN_BYTES = 12;

async function importMasterKey(masterKeyB64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(masterKeyB64);
  if (raw.length !== 32) {
    throw new Error(`BYOK_MASTER_KEY must decode to 32 bytes, got ${raw.length}`);
  }
  return crypto.subtle.importKey('raw', raw, { name: ALG }, false, ['encrypt', 'decrypt']);
}

export interface EncryptedKey {
  /** base64(ciphertext + auth tag) */
  encrypted: string;
  /** base64(iv) */
  iv: string;
  /** 末 4 位明文，UI 给用户确认。其它位置不暴露。 */
  mask: string;
}

export async function encryptApiKey(plain: string, masterKeyB64: string): Promise<EncryptedKey> {
  if (!plain) throw new Error('empty key');
  const key = await importMasterKey(masterKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN_BYTES));
  const ct = await crypto.subtle.encrypt({ name: ALG, iv }, key, new TextEncoder().encode(plain));
  return {
    encrypted: bytesToBase64(new Uint8Array(ct)),
    iv: bytesToBase64(iv),
    mask: plain.length <= 4 ? plain : plain.slice(-4),
  };
}

export async function decryptApiKey(
  encryptedB64: string,
  ivB64: string,
  masterKeyB64: string,
): Promise<string> {
  const key = await importMasterKey(masterKeyB64);
  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(encryptedB64);
  const pt = await crypto.subtle.decrypt({ name: ALG, iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ?? 0);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
