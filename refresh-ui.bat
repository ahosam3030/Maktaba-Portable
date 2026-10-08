@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - UI Refresh

echo ========================================
echo   تحديث واجهة Maktaba Desktop
echo ========================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] ثبّت Node.js أولاً
  pause
  exit /b 1
)

echo [1/4] git pull...
if exist "C:\Program Files\Git\cmd\git.exe" (
  "C:\Program Files\Git\cmd\git.exe" pull origin main
) else (
  git pull origin main 2>nul
)

echo [2/4] حذف الواجهة القديمة...
if exist "apps\web\dist" rd /s /q "apps\web\dist"

echo [3/4] بناء الواجهة...
cd apps\web
if not exist "node_modules\" call npm install
set VITE_API_URL=
call npm run build
if errorlevel 1 (
  echo.
  echo BUILD FAILED — راجع الأخطاء أعلاه
  cd /d "%~dp0"
  pause
  exit /b 1
)
cd /d "%~dp0"

if not exist "apps\web\dist\index.html" (
  echo [خطأ] لم يُنشأ apps\web\dist\index.html
  pause
  exit /b 1
)

echo [4/4] تم بناء الواجهة بنجاح.
echo.
echo اقفل نافذة Maktaba إن كانت مفتوحة، ثم اضغط أي زر لتشغيل البرنامج...
pause
call "%~dp0start-desktop.bat"
