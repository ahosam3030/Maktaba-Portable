@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - بناء منتج للتوزيع
echo ========================================
echo   بناء Maktaba للتوزيع (Portable + Setup)
echo ========================================
echo.

call build-desktop.bat
if errorlevel 1 exit /b 1

echo.
echo تثبيت electron-builder...
call npm install
call npm install --save-dev electron-builder
if not exist "data\" mkdir data
if not exist "data\.gitkeep" echo. > data\.gitkeep

echo.
echo بناء حزم Windows (قد يستغرق عدة دقائق)...
call npx electron-builder --win portable nsis --x64
if errorlevel 1 (
  echo فشل electron-builder — تحقق من الاتصال والإنترنت
  pause
  exit /b 1
)

echo.
echo تم. الملفات في مجلد release\
dir /b release\*.exe 2>nul
echo.
echo - Maktaba-Portable-*.exe  = تشغيل بدون تثبيت
echo - Maktaba-*-Setup.exe     = مثبّت Windows
pause
