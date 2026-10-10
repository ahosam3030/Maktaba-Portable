# ملاحظات التقوية (1.5.x)

## تم إصلاحه في electron/main.js
- نسخ احتياطي عبر VACUUM INTO + integrity_check عند توفر better-sqlite3
- استعادة: فحص سلامة الملف المصدر قبل الاستبدال + نسخة before-restore
- pickPort يرمي خطأ بدل إرجاع منفذ مشغول
- waitForApi يقرأ جسم /api/health ويتأكد من خدمة المكتبة
- migrate resolve --applied فقط بعد integrity_check على قاعدة موجودة
- كتابة config ذرية (tmp + rename)

## متبقٍ قبل البيع الواسع
- Code signing (شهادة Windows)
- رفع .exe على GitHub Releases + CI
- تقوية الترخيص ضد تعديل asar
- اختبارات آلية أوسع للمبيعات/الآجل/الخزينة
