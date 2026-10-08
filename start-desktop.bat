@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba Desktop

where node >nul 2>&1
if errorlevel 1 (
  echo ثبّت Node.js 20+ من https://nodejs.org
  pause
  exit /b 1
)

if not exist "package.json" (
  echo [خطأ] package.json غير موجود في: %CD%
  pause
  exit /b 1
)

if not exist "electron\main.js" (
  echo [خطأ] electron\main.js غير موجود
  pause
  exit /b 1
)

if not exist "apps\web\dist\index.html" (
  echo بناء الواجهة أول مرة...
  if exist "%~dp0build-desktop.bat" (
    call "%~dp0build-desktop.bat"
  ) else (
    call "%~dp0refresh-ui.bat"
  )
  if not exist "apps\web\dist\index.html" (
    echo فشل بناء الواجهة
    pause
    exit /b 1
  )
)

if not exist "node_modules\electron\package.json" (
  echo تثبيت electron...
  call npm install
  if errorlevel 1 (
    echo فشل npm install
    pause
    exit /b 1
  )
)

if not exist "data\" mkdir data
if not exist "apps\api\.env" if exist "apps\api\.env.example" copy /Y "apps\api\.env.example" "apps\api\.env" >nul

echo تشغيل Maktaba من: %CD%
REM النقطة . تعني مجلد المشروع الحالي (يعتمد على package.json → main)
call npx --no-install electron .
if errorlevel 1 (
  echo.
  echo محاولة مسار electron.exe مباشرة...
  if exist "node_modules\electron\dist\electron.exe" (
    "node_modules\electron\dist\electron.exe" .
  ) else (
    echo [خطأ] Electron غير مثبت. نفّذ: npm install
    pause
    exit /b 1
  )
)
exit /b 0
