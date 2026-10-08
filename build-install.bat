@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - بناء Install.exe
echo ========================================
echo   بناء ملف التثبيت Install.exe
echo ========================================
echo.

call preflight-check.bat
if errorlevel 1 ( pause & exit /b 1 )

call build-desktop.bat
if errorlevel 1 exit /b 1

call npm install
if errorlevel 1 exit /b 1

if not exist "data\" mkdir data
if not exist "data\.gitkeep" echo. > data\.gitkeep

echo.
echo بناء المثبت NSIS (Install)...
call npx electron-builder --win nsis --x64
if errorlevel 1 (
  echo.
  echo فشل NSIS — بناء بديل: مجلد + سكربت تثبيت بسيط
  call npx electron-builder --win dir --x64
  if errorlevel 1 (
    echo فشل البناء بالكامل
    pause
    exit /b 1
  )
  echo.
  echo تم: release\win-unpacked\Maktaba.exe
  echo لعمل مثبت بسيط شغّل: create-simple-installer.bat
  pause
  exit /b 0
)

echo.
echo ========== نجح ==========
echo المثبت:
dir /b release\Maktaba-Install-*.exe 2>nul
dir /b release\*.exe 2>nul
echo.
echo الملف في مجلد release\
echo ثبّته على جهازك أو أرسله للعميل.
pause
