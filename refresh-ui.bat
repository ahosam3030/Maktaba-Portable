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
  echo [ERROR] Install Node.js first
  pause
  exit /b 1
)

echo [1/4] git pull...
"C:\Program Files\Git\cmd\git.exe" pull origin main

echo [2/4] remove old dist...
if exist "apps\web\dist" rd /s /q "apps\web\dist"

echo [3/4] build web...
cd apps\web
set VITE_API_URL=http://127.0.0.1:3000/api
call npm run build
if errorlevel 1 (
  echo BUILD FAILED
  cd ..\..
  pause
  exit /b 1
)
cd ..\..

echo [4/4] done. Close Maktaba window then run start-desktop.bat
echo.
pause
call start-desktop.bat
