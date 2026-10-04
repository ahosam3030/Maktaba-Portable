@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - بناء التطبيق
echo ========================================
echo   بناء تطبيق Maktaba Desktop
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [خطأ] ثبّت Node.js 20+ من https://nodejs.org
  pause
  exit /b 1
)

if not exist "data\" mkdir data

if not exist "apps\api\.env" (
  copy /Y "apps\api\.env.example" "apps\api\.env" >nul
)

echo [1/6] حزم الجذر + Electron...
call npm install
if errorlevel 1 ( pause & exit /b 1 )

echo [2/6] حزم API...
pushd apps\api
call npm install
echo [3/6] Prisma + بناء API...
call npx prisma generate
call npx prisma db push --skip-generate
call npm run build
if errorlevel 1 ( popd & echo فشل بناء API & pause & exit /b 1 )
popd

echo [4/6] حزم الواجهة...
pushd apps\web
call npm install
echo [5/6] بناء الواجهة للتطبيق...
set VITE_API_URL=http://127.0.0.1:3000/api
call npm run build
if errorlevel 1 ( popd & echo فشل بناء الواجهة & pause & exit /b 1 )
popd

echo [6/6] تم البناء.
echo.
echo شغّل التطبيق بـ:  start-desktop.bat
echo أول مرة: seed.bat لإنشاء حساب المالك
echo.
pause
