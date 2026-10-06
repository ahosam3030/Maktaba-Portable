@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [خطأ] ثبّت Node.js 20+ من https://nodejs.org
  pause
  exit /b 1
)

if not exist "apps\web\dist\index.html" (
  echo [أول تشغيل] بناء التطبيق — قد يستغرق دقائق...
  call "%~dp0build-desktop.bat"
  if not exist "apps\web\dist\index.html" (
    echo فشل البناء.
    pause
    exit /b 1
  )
)

if not exist "apps\api\dist\main.js" (
  call "%~dp0build-desktop.bat"
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo تثبيت Electron...
  call npm install
  if not exist "node_modules\electron\dist\electron.exe" (
    echo فشل تثبيت Electron
    pause
    exit /b 1
  )
)

if not exist "data\" mkdir data
if not exist "apps\api\.env" copy /Y "apps\api\.env.example" "apps\api\.env" >nul

REM تشغيل Electron منفصلًا ثم إغلاق هذه النافذة فورًا
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
exit /b 0
