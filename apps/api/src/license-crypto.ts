import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'crypto';

/** المفتاح العام مضمّن في نسخة العميل — الخاص عند البائع فقط */
export const EMBEDDED_PUBLIC_KEY_SPKI_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATBFUw+fljgRgj6OcINUPnQkbvw/XWqmPI8/uniOD2Kc=
-----END PUBLIC KEY-----`;

export type LicensePayload = {
  product: string;
  maxDevices: number;
  issuedAt: string;
  note?: string;
};

export function generateLicenseKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
}

function b64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

/** إصدار مفتاح عند البائع (يحتاج المفتاح الخاص) */
export function issueSignedLicense(
  privateKeyPem: string,
  maxDevices: number,
  note?: string,
): string {
  const payload: LicensePayload = {
    product: 'Maktaba-Portable',
    maxDevices: Math.max(1, Math.min(99, maxDevices)),
    issuedAt: new Date().toISOString(),
    note: note || undefined,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const key = createPrivateKey(privateKeyPem);
  const sig = sign(null, body, key);
  return `MAK2.${b64url(body)}.${b64url(sig)}`;
}

export function verifySignedLicense(
  serial: string,
  publicKeyPem?: string,
): { ok: boolean; maxDevices: number; payload?: LicensePayload; reason?: string } {
  const s = String(serial || '').trim();
  if (!s.startsWith('MAK2.')) {
    return { ok: false, maxDevices: 0, reason: 'صيغة قديمة أو غير مدعومة' };
  }
  const parts = s.split('.');
  if (parts.length !== 3) return { ok: false, maxDevices: 0, reason: 'مفتاح تالف' };
  try {
    const body = fromB64url(parts[1]);
    const sig = fromB64url(parts[2]);
    const pem =
      (process.env.LICENSE_PUBLIC_KEY || '').trim() ||
      publicKeyPem ||
      EMBEDDED_PUBLIC_KEY_SPKI_PEM;
    if (pem.includes('placeholder')) {
      return { ok: false, maxDevices: 0, reason: 'المفتاح العام غير مضبوط عند البائع بعد' };
    }
    const key = createPublicKey(pem);
    const ok = verify(null, body, key, sig);
    if (!ok) return { ok: false, maxDevices: 0, reason: 'توقيع غير صالح' };
    const payload = JSON.parse(body.toString('utf8')) as LicensePayload;
    if (payload.product !== 'Maktaba-Portable') {
      return { ok: false, maxDevices: 0, reason: 'منتج غير مطابق' };
    }
    const maxDevices = Number(payload.maxDevices) || 0;
    if (maxDevices < 1) return { ok: false, maxDevices: 0, reason: 'حد أجهزة غير صالح' };
    return { ok: true, maxDevices, payload };
  } catch (e) {
    return { ok: false, maxDevices: 0, reason: e instanceof Error ? e.message : 'فشل التحقق' };
  }
}

/** توافق مع المفاتيح القديمة HMAC إن وُجد LICENSE_SECRET */
export function verifyLegacyHmac(serial: string, secret: string): { ok: boolean; maxDevices: number } {
  if (!secret || secret.length < 16) return { ok: false, maxDevices: 0 };
  const { createHmac } = require('crypto') as typeof import('crypto');
  const s = String(serial || '').trim().toUpperCase();
  const m = /^MAK-([A-F0-9]{4})-([A-F0-9]{4})-([A-F0-9]{4})-(\d{1,2})([A-F0-9]{4})$/.exec(s);
  if (!m) return { ok: false, maxDevices: 0 };
  const maxDevices = parseInt(m[4], 10);
  const payload = `${m[1]}-${m[2]}-${m[3]}:${maxDevices}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex').slice(0, 4).toUpperCase();
  return { maxDevices, ok: sig === m[5] && maxDevices >= 1 };
}
