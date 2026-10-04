# Maktaba Portable

نسخة **محمولة / جهاز واحد** من نظام إدارة مركز الخدمات والمكتبات.

| | النسخة الحالية (هذا الريبو) | النسخة الشبكية |
|--|------------------------------|----------------|
| الريبو | **Maktaba-Portable** | [Maktaba](https://github.com/ahosam3030/Maktaba) (مستقلة — لا تُعدَّل من هنا) |
| قاعدة البيانات | **SQLite** (ملف `data/maktaba.db`) | PostgreSQL |
| التثبيت | Node.js فقط | Node + PostgreSQL |
| الاستخدام | جهاز واحد / فلاشة عمل | شبكة أو عدة أجهزة |

## تشغيل سريع (Windows)

1. ثبّت [Node.js 20+](https://nodejs.org)
2. دبل كليك **`start.bat`**
3. أول مرة: دبل كليك **`seed.bat`** وأنشئ حساب المالك (بريد + كلمة مرور قوية)
4. افتح المتصفح على `http://localhost:5173`

## المجلدات المهمة

| المسار | الوظيفة |
|--------|---------|
| `data/maktaba.db` | كل البيانات |
| `data/` | قاعدة + ملفات محلية |
| `backups/` | نسخ احتياطي (`backup.bat`) |
| `apps/api/uploads/` | صور المنتجات |

## أوامر يدوية

```bash
cd apps/api
npm install
npx prisma generate
npx prisma db push
npm run start:dev

# نافذة أخرى
cd apps/web
npm install
npm run dev
```

## ملاحظات

- لا تحتاج PostgreSQL ولا Docker.
- انسخ مجلد المشروع كاملًا (مع `data/`) لنقل النظام لجهاز آخر.
- كلمة المرور: حرف كبير + صغير + رقم + رمز.
- النسخة الشبكية (PostgreSQL) تبقى في ريبو **Maktaba** بدون تغيير.

## الوحدات

نفس منطق الأعمال تقريبًا: منتجات، مشتريات، مبيعات، مخزون، خدمات، خزينة، تقارير، صلاحيات.
