# Maktaba Portable — منتج سطح مكتب

نظام إدارة المكتبة والخدمات لـ **Windows**.

## للمستخدم النهائي

| الملف | الوظيفة |
|--------|---------|
| `start-desktop.bat` | تشغيل البرنامج |
| `seed.bat` | إنشاء حساب المالك (أول مرة) |
| `backup.bat` | نسخ احتياطي سريع لقاعدة البيانات |
| `restore-backup.bat` | استعادة من مجلد backups |
| `refresh-ui.bat` | تحديث الواجهة من GitHub |
| `build-release.bat` | بناء مثبّت + نسخة Portable للتوزيع |
| `دليل-الاستخدام.md` | دليل عربي مختصر |

### من داخل البرنامج
**ملف → نسخ احتياطي / استعادة** — اختيار مكان الحفظ أو ملف الاستعادة.

### بناء منتج للتوزيع
```bat
build-desktop.bat
build-release.bat
```
المخرجات في `release/` :
- `Maktaba-Portable-1.0.0.exe`
- مثبّت NSIS مع اختصار سطح المكتب

---

# Maktaba Portable — تطبيق سطح مكتب

نسخة **محمولة** من نظام إدارة المكتبة/المركز:

- **نافذة برنامج** (Electron) — لا تفتح المتصفح
- **SQLite** — ملف `data/maktaba.db` بدون PostgreSQL
- ريبو **Maktaba** الأصلي (PostgreSQL/الشبكة) منفصل ولم يُعدَّل

## التشغيل كبرنامج (موصى به)

1. ثبّت [Node.js 20+](https://nodejs.org)
2. **أول مرة فقط:** دبل كليك `build-desktop.bat` (يبني API + الواجهة + Electron)
3. دبل كليك **`start-desktop.bat`** → تفتح **نافذة التطبيق**
4. أول حساب: دبل كليك `seed.bat` (أدخل YES ثم بريدك وكلمة مرور قوية)

## أوامر بديلة

```bat
npm install
build-desktop.bat
start-desktop.bat
```

## التشغيل القديم عبر المتصفح (اختياري للتطوير)

`start.bat` ما زال يفتح المتصفح على `localhost:5173` للمطورين فقط.

## البيانات

- القاعدة: `data/maktaba.db`
- النسخ الاحتياطي: `backup.bat`

## ملاحظات

- التطبيق يشغّل خادمًا محليًا على المنفذ 3000 داخل الجهاز فقط.
- لا تحتاج PostgreSQL أو Docker.

---


## تفاصيل تقنية

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
