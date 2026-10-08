/** مرة واحدة عند البائع: يولّد زوج مفاتيح ويحدّث المفتاح العام في الكود */
const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

fs.writeFileSync(path.join(__dirname, 'license-public.pem'), pub);
fs.writeFileSync(path.join(__dirname, 'license-private.pem'), priv);

const cryptoPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'license-crypto.ts');
let t = fs.readFileSync(cryptoPath, 'utf8');
t = t.replace(
  /export const EMBEDDED_PUBLIC_KEY_SPKI_PEM = `[\s\S]*?`;/,
  `export const EMBEDDED_PUBLIC_KEY_SPKI_PEM = \`${pub.trim()}\`;`,
);
fs.writeFileSync(cryptoPath, t);
console.log('تم: tools/license-private.pem (سرّي) + تحديث المفتاح العام في license-crypto.ts');
console.log('لا ترفع license-private.pem إلى Git. أعد بناء البرنامج بعد ذلك.');
