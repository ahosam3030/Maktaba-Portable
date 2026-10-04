import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';


/** سياسة كلمة المرور: 8 أحرف على الأقل + كبير + صغير + رقم + رمز */
export const PASSWORD_POLICY_MESSAGE =
  'كلمة المرور: 8 أحرف على الأقل وتشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا (!@#$%^&* إلخ).';

export function isStrongPassword(password: string): boolean {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

/** true إذا كانت الصيغة قديمة (bcrypt) أو تكرارات PBKDF2 أقل من الحالي */
export function passwordNeedsRehash(passwordHash: string): boolean {
  if (!passwordHash) return true;
  if (passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$') || passwordHash.startsWith('$2y$')) {
    return true;
  }
  if (!passwordHash.startsWith('pbkdf2_sha256$')) return true;
  const parts = passwordHash.split('$');
  const iterations = parseInt(parts[1] || '0', 10);
  return !Number.isFinite(iterations) || iterations < 210_000;
}

/**
 * كلمات المرور: PBKDF2-HMAC-SHA256 (ملح عشوائي + تكرارات كثيرة).
 * الصيغة: pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>
 *
 * SHA-256 الخام وحده سريع جدًا وكسره سهل ببطاقات الشاشة؛
 * PBKDF2 يبطّئ العملية عمدًا ويستخدم SHA-256 كما طلبت.
 */
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_KEYLEN = 32; // 256 bit
const SALT_LEN = 16;

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = await pbkdf2Async(plain, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  if (!plain || !passwordHash) return false;

  // دعم كلمات المرور القديمة المخزّنة بـ bcrypt أثناء الانتقال
  if (passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$') || passwordHash.startsWith('$2y$')) {
    return bcrypt.compare(plain, passwordHash);
  }

  if (!passwordHash.startsWith('pbkdf2_sha256$')) {
    return false;
  }

  const parts = passwordHash.split('$');
  if (parts.length !== 4) return false;
  const iterations = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], 'base64url');
  const expected = Buffer.from(parts[3], 'base64url');
  if (!Number.isFinite(iterations) || iterations < 1 || salt.length < 8 || expected.length < 16) {
    return false;
  }

  const actual = await pbkdf2Async(plain, salt, iterations);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function pbkdf2Async(plain: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(plain, salt, iterations, PBKDF2_KEYLEN, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getAesKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw.trim()) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw.trim())) {
    return Buffer.from(raw.trim(), 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

/** AES-256-GCM اختياري لبيانات غير كلمات المرور */
export function encryptSensitive(plain: string): string {
  if (plain == null || plain === '') return plain;
  const key = getAesKey();
  if (!key) return plain;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptSensitive(stored: string | null | undefined): string {
  if (stored == null || stored === '') return '';
  if (!stored.startsWith('enc:v1:')) return stored;
  const key = getAesKey();
  if (!key) return stored;
  const parts = stored.split(':');
  if (parts.length !== 5) return stored;
  const iv = Buffer.from(parts[2], 'base64url');
  const tag = Buffer.from(parts[3], 'base64url');
  const data = Buffer.from(parts[4], 'base64url');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function encryptionConfigured(): boolean {
  return Boolean(getAesKey());
}
