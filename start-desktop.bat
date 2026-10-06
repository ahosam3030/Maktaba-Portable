@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba Desktop

where node >nul 2>&1
if errorlevel 1 (
  echo [خطأ] ثبّت Node.js 20+ من https://nodejs.org
  pause
  exit /b 1
)

if not exist "apps\web\dist\index.html" (
  echo [أول تشغيل] بناء التطبيق — قد يستغرق دقائق...
  call "%~dp0build-desktop.bat"
  if not exist "apps\web\dist\index.html" (
    echo فشل البناء.
    pause
    exit /b 1
  )
)

if not exist "apps\api\dist\main.js" (
  echo بناء الخادم المحلي...
  call "%~dp0build-desktop.bat"
)

if not exist "node_modules\electron" (
  echo تثبيت Electron...
  call npm install
  if errorlevel 1 (
    echo فشل تثبيت Electron
    pause
    exit /b 1
  )
)

if not exist "data\" mkdir data
if not exist "apps\api\.env" copy /Y "apps\api\.env.example" "apps\api\.env" >nul

echo.
echo جارٍ فتح نافذة تطبيق Maktaba...
echo (لا تغلق هذه النافذة أثناء استخدام البرنامج)
echo.
call npx electron .
set ERR=%ERRORLEVEL%
if %ERR% neq 0 (
  echo.
  echo فشل تشغيل التطبيق. كود الخطأ: %ERR%
  echo جرّب: build-desktop.bat ثم أعد المحاولة
  pause
)
exit /b %ERR%
