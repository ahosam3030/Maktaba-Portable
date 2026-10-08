# ترخيص Ed25519

1. المفتاح **العام** مضمّن في البرنامج (license-public.pem).
2. المفتاح **الخاص** `license-private.pem` عند البائع فقط — لا ترفعه لـ Git.
3. إصدار مفتاح لعميل:
```
node tools/issue-license.js 1 "اسم العميل"
```
4. إن ضاع الخاص: ولّد زوجًا جديدًا واستبدل EMBEDDED_PUBLIC_KEY في license-crypto.ts وأعد بناء كل النسخ.
