@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba Desktop

where node >nul 2>&1
if errorlevel 1 (
  echo [خطأ] ثبّت Node.js 20+ من https://nodejs.org
  pause
  exit /b 1
)

if not exist "apps\web\dist\index.html" (
  echo الواجهة غير مبنية. سيتم البناء الآن...
  call build-desktop.bat
  if not exist "apps\web\dist\index.html" (
    echo فشل البناء.
    pause
    exit /b 1
  )
)

if not exist "apps\api\dist\main.js" (
  echo API غير مبني. سيتم البناء...
  call build-desktop.bat
)

if not exist "node_modules\electron" (
  echo تثبيت Electron...
  call npm install
)

if not exist "data\" mkdir data
if not exist "apps\api\.env" copy /Y "apps\api\.env.example" "apps\api\.env" >nul

echo تشغيل تطبيق Maktaba...
call npx electron .
if errorlevel 1 (
  echo فشل تشغيل Electron
  pause
)
