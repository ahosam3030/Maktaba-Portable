@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba 1.5.0 - بناء Release / Install
echo ========================================
echo   Maktaba — بناء Install.exe
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
echo [1/2] win-unpacked...
call npx electron-builder --win dir --x64
if errorlevel 1 (
  echo فشل win-unpacked
  pause
  exit /b 1
)

echo.
echo [2/2] Install.exe (NSIS)...
call npx electron-builder --win nsis --x64
if errorlevel 1 (
  echo.
  echo NSIS فشل — جاري إنشاء مثبت بسيط...
  call create-simple-installer.bat
  echo.
  echo يمكنك التشغيل من: release\win-unpacked\Maktaba.exe
  pause
  exit /b 0
)

echo.
echo ========== تم ==========
echo.
dir /b release\*.exe 2>nul
echo.
echo المثبت: release\Maktaba-Install-1.5.0.exe
echo أو أي *.exe في release\
pause
