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
  echo.
  echo فشل الفحص المسبق — أصلح الأخطاء قبل البناء
  pause
  exit /b 1
)

echo.
call build-desktop.bat
if errorlevel 1 exit /b 1

echo.
echo تثبيت أدوات البناء...
call npm install
if errorlevel 1 exit /b 1

if not exist "data\" mkdir data
if not exist "data\.gitkeep" echo. > data\.gitkeep

echo.
echo بناء حزم Windows x64...
call npx electron-builder --win portable nsis --x64
if errorlevel 1 (
  echo فشل electron-builder
  pause
  exit /b 1
)

echo.
echo ========== تم بناء Release 1.5.0 ==========
dir /b release\*.exe 2>nul
echo.
echo الملفات في مجلد release\
echo قبل التوزيع: RELEASE.md و TEST-CHECKLIST.md
pause
