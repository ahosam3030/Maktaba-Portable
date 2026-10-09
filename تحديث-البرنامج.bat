@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - تحديث كامل من GitHub

echo ========================================
echo   تحديث Maktaba من GitHub + إعادة بناء
echo ========================================
echo.
echo المجلد الحالي: %CD%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] ثبّت Node.js أولاً من https://nodejs.org
  pause
  exit /b 1
)

set "GIT=git"
if exist "C:\Program Files\Git\cmd\git.exe" set "GIT=C:\Program Files\Git\cmd\git.exe"

echo [1/6] جلب آخر كود من GitHub...
"%GIT%" fetch origin
if errorlevel 1 (
  echo فشل git fetch — تأكد من الإنترنت واسم المجلد Maktaba-Portable
  pause
  exit /b 1
)
"%GIT%" reset --hard origin/main
if errorlevel 1 (
  echo فشل git reset
  pause
  exit /b 1
)
echo.
echo آخر commit:
"%GIT%" log -1 --oneline
echo.
echo يجب أن ترى: 0e09bdd أو أحدث (credit partial pay / inventory)
echo.

echo [2/6] حذف الواجهة والخادم القديمين...
if exist "apps\web\dist" rd /s /q "apps\web\dist"
if exist "apps\api\dist" rd /s /q "apps\api\dist"

echo [3/6] تثبيت/تحديث حزم API...
pushd apps\api
if not exist "node_modules\" call npm install
call npx prisma generate
echo [4/6] بناء API...
call npm run build
if errorlevel 1 (
  popd
  echo فشل بناء API
  pause
  exit /b 1
)
popd

echo [5/6] بناء الواجهة...
pushd apps\web
if not exist "node_modules\" call npm install
set VITE_API_URL=
call npm run build
if errorlevel 1 (
  popd
  echo فشل بناء الواجهة
  pause
  exit /b 1
)
popd

if not exist "apps\web\dist\index.html" (
  echo [خطأ] لم يُنشأ apps\web\dist\index.html
  pause
  exit /b 1
)
if not exist "apps\api\dist\main.js" (
  echo [خطأ] لم يُنشأ apps\api\dist\main.js
  pause
  exit /b 1
)

echo [6/6] تم التحديث والبناء بنجاح.
echo.
echo اقفل أي نافذة Maktaba مفتوحة ثم اضغط أي زر للتشغيل...
pause
call "%~dp0start-desktop.bat"
