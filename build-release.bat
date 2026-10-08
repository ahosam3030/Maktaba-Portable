@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba 1.5.0 - بناء Release
echo ========================================
echo   Maktaba Portable 1.5.0 — Release Build
echo ========================================
echo.

call preflight-check.bat
if errorlevel 1 (
  echo فشل الفحص المسبق
  pause
  exit /b 1
)

call build-desktop.bat
if errorlevel 1 exit /b 1

echo.
echo تثبيت أدوات البناء...
call npm install
if errorlevel 1 exit /b 1

if not exist "data\" mkdir data
if not exist "data\.gitkeep" echo. > data\.gitkeep

echo.
echo [أ] بناء مجلد التشغيل win-unpacked (بدون NSIS)...
call npx electron-builder --win dir --x64
if errorlevel 1 (
  echo فشل بناء win-unpacked
  pause
  exit /b 1
)

echo.
echo [ب] محاولة بناء Portable exe...
call npx electron-builder --win portable --x64
if errorlevel 1 (
  echo.
  echo تحذير: فشل Portable بسبب الايقونة/NSIS
  echo يمكنك التشغيل مباشرة من:
  echo   release\win-unpacked\Maktaba.exe
  echo.
  echo انسخ مجلد release\win-unpacked إلى أي مكان وشغّل Maktaba.exe
  pause
  exit /b 0
)

echo.
echo ========== تم البناء ==========
echo.
echo 1^) تشغيل فوري بدون تثبيت:
echo    release\win-unpacked\Maktaba.exe
echo.
echo 2^) ملف محمول إن وُجد:
dir /b release\*.exe 2>nul
echo.
pause
