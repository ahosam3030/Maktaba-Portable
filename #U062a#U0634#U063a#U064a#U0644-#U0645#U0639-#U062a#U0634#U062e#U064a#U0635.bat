@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba Debug
echo === تشخيص تشغيل Maktaba ===
echo.

if not exist "apps\web\dist\index.html" (
  echo [!] الواجهة غير مبنية
  call build-desktop.bat
)
if not exist "apps\api\dist\main.js" (
  echo [!] API غير مبني
  call build-desktop.bat
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo تثبيت electron...
  call npm install
)

echo.
echo تشغيل Electron (ستظهر الأخطاء هنا)...
echo.
taskkill /IM electron.exe /F >nul 2>&1
"node_modules\electron\dist\electron.exe" .
echo.
echo خرج البرنامج بكود %ERRORLEVEL%
pause
