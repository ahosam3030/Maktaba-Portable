# Maktaba Portable — Release **1.5.0**

## بناء المثبت (على ويندوز)

```bat
git pull origin main
preflight-check.bat
build-release.bat
```

المخرجات في:

```text
release\Maktaba-Setup-1.5.0.exe
release\win-unpacked\Maktaba.exe
```

## نشر GitHub Release (البند 2)

### أ) من الموقع (أسهل)

1. افتح: https://github.com/ahosam3030/Maktaba-Portable/releases/new
2. **Tag:** `v1.5.0` (أنشئ الوسم إن لم يوجد)
3. **Title:** `Maktaba Portable 1.5.0`
4. الصق ملاحظات الإصدار من الأسفل
5. ارفع الملف: `release\Maktaba-Setup-1.5.0.exe`
6. **Publish release**

### ب) من سطر الأوامر (مع GitHub CLI)

```bat
gh release create v1.5.0 release\Maktaba-Setup-1.5.0.exe --title "Maktaba Portable 1.5.0" --notes-file RELEASE-NOTES-1.5.0.md
```

## ملاحظات الإصدار 1.5.0

- توحيد رقم الإصدار 1.5.0 في الواجهة والتوثيق والمثبت
- مبيعات **آجل**: حساب عميل تلقائي + تبويب تحصيل
- Migration + ترخيص MAK2 + صيانة
- أيقونة Maktaba للمثبت والاختصار
- بيانات في AppData — لا تُمسح مع إلغاء التثبيت

## بعد النشر

- اختبر التحميل من صفحة Releases على جهاز نظيف
- (مستحسن) وقّع الـ exe قبل الرفع — انظر ملف Code Signing
