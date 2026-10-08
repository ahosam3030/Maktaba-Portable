# Maktaba Portable — Release 1.5.0

## ماذا في هذه النسخة؟
- تطبيق ويندوز (Electron) + SQLite محلي
- مبيعات، مشتريات، مخزون، خدمات، خزينة، تقارير
- ترخيص MAK2 (Ed25519) + تجربة 14 يوم
- Migration آمنة + صيانة + تقرير دعم
- نسخ احتياطي من القائمة: ملف → نسخ احتياطي / استعادة

## بناء النسخة (جهاز المطوّر)
1. Node.js 20+
2. من جذر المشروع:
   ```
   preflight-check.bat
   build-release.bat
   ```
3. الناتج في `release\`

## بعد البناء (إلزامي قبل البيع)
1. ثبّت على جهاز ويندوز نظيف
2. نفّذ `TEST-CHECKLIST.md`
3. (موصى به) وقّع المثبت بشهادة Code Signing
4. ارفع كـ GitHub Release بالوسم `v1.5.0`

## بيانات العميل
`%APPDATA%\Maktaba\maktaba-data\`

## إصدار مفتاح ترخيص (عندك فقط)
```
node tools/issue-license.js 1 "اسم العميل"
```
لا ترفع `tools/license-private.pem` إلى Git.
