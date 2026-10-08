/**
 * إصدار مفتاح ترخيص Ed25519 — شغّله عند البائع فقط
 * node tools/issue-license.js [maxDevices] [note]
 */
const fs = require('fs');
const path = require('path');
const { createPrivateKey, sign } = require('crypto');

const privPath = path.join(__dirname, 'license-private.pem');
if (!fs.existsSync(privPath)) {
  console.error('ضع license-private.pem في tools/ (لا ترفعه لـ Git)');
  process.exit(1);
}
const maxDevices = Math.max(1, Math.min(99, parseInt(process.argv[2] || '1', 10)));
const note = process.argv[3] || '';
const payload = {
  product: 'Maktaba-Portable',
  maxDevices,
  issuedAt: new Date().toISOString(),
  note: note || undefined,
};
const body = Buffer.from(JSON.stringify(payload), 'utf8');
const key = createPrivateKey(fs.readFileSync(privPath, 'utf8'));
const sig = sign(null, body, key);
const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const serial = `MAK2.${b64url(body)}.${b64url(sig)}`;
console.log(serial);
console.log('maxDevices=', maxDevices);
