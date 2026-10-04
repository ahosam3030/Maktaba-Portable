@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

title Maktaba Portable
echo ========================================
echo   Maktaba Portable - تشغيل محلي
echo   (SQLite - بدون PostgreSQL)
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
  echo تم إنشاء apps\api\.env
)

echo [1/5] حزم الخادم...
pushd apps\api
if not exist "node_modules\" call npm install
echo [2/5] Prisma Client...
call npx prisma generate
if errorlevel 1 ( echo فشل prisma generate & popd & pause & exit /b 1 )
echo [3/5] قاعدة SQLite...
call npx prisma db push --skip-generate
if errorlevel 1 (
  echo تعذر إنشاء/تحديث قاعدة البيانات
  popd & pause & exit /b 1
)
popd

echo [4/5] حزم الواجهة...
pushd apps\web
if not exist "node_modules\" call npm install
popd

echo [5/5] تشغيل API + الواجهة...
start "Maktaba API" cmd /k "cd /d "%~dp0apps\api" && npm run start:dev"
timeout /t 4 /nobreak >nul
start "Maktaba Web" cmd /k "cd /d "%~dp0apps\web" && npm run dev"
timeout /t 6 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo تم التشغيل. لا تغلق نافذتي API و Web.
echo البيانات في: data\maktaba.db
echo أول مرة: شغّل seed.bat لإنشاء حساب المالك
pause
