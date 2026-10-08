@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - Install.exe
echo ========================================
echo   بناء Maktaba-Install.exe
echo ========================================
echo.

git pull origin main 2>nul
if exist "C:\Program Files\Git\cmd\git.exe" "C:\Program Files\Git\cmd\git.exe" pull origin main

call build-desktop.bat
if errorlevel 1 exit /b 1

call npm install
if errorlevel 1 exit /b 1

if not exist "data\" mkdir data

echo.
echo حذف ايقونة قديمة تسبب فشل NSIS (اختياري)...
if exist "build\icon.ico.bad" del "build\icon.ico.bad"
if exist "build\icon.ico" (
  ren "build\icon.ico" "icon.ico.bak" 2>nul
)

echo.
echo بناء المثبت بدون ايقونة مخصصة...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win nsis --x64 -c.win.icon=null
if errorlevel 1 (
  echo محاولة ثانية...
  call npx electron-builder --win nsis --x64
)
if errorlevel 1 (
  echo.
  echo NSIS فشل. بناء win-unpacked + مثبت بسيط...
  call npx electron-builder --win dir --x64
  call create-simple-installer.bat
  pause
  exit /b 0
)

echo.
echo ========== نجح ==========
dir /b release\Maktaba-Install-*.exe 2>nul
dir /b release\*.exe 2>nul
echo.
echo المثبت في مجلد release\
if exist "build\icon.ico.bak" ren "build\icon.ico.bak" "icon.ico"
pause
