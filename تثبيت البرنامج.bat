@echo off
chcp 65001 >nul
cd /d "%~dp0"
title تثبيت Maktaba
echo ========================================
echo   بناء مثبّت Windows (برنامج عادي)
echo   اختصار سطح المكتب + قائمة ابدأ
echo ========================================
echo.
echo قد يستغرق عدة دقائق...
echo.

call "%~dp0build-desktop.bat"
if errorlevel 1 exit /b 1

echo.
echo بناء ملف التثبيت Setup...
call npm install
call npx electron-builder --win nsis --x64
if errorlevel 1 (
  echo فشل البناء
  pause
  exit /b 1
)

echo.
echo تم. افتح مجلد release وشغّل:
echo   Maktaba-Setup-*.exe
echo.
explorer "%~dp0release"
pause
