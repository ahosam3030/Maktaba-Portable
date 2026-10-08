@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - استعادة نسخة احتياطية

echo ========================================
echo   استعادة نسخة احتياطية
echo ========================================
echo.
echo أوقف البرنامج تمامًا قبل الاستعادة.
echo.

set /p BAK=مسار ملف .db الاحتياطي: 
if not exist "%BAK%" (
  echo الملف غير موجود
  pause
  exit /b 1
)

REM تحقق من ترويسة SQLite
node -e "const fs=require('fs');const b=fs.readFileSync(process.argv[1]);const h=b.slice(0,16).toString('utf8');if(!h.startsWith('SQLite format 3')){console.error('الملف ليس قاعدة SQLite صالحة');process.exit(1);}console.log('OK SQLite header');" "%BAK%"
if errorlevel 1 (
  pause
  exit /b 1
)

set "TARGET="
if exist "%APPDATA%\Maktaba\maktaba.db" set "TARGET=%APPDATA%\Maktaba\maktaba.db"
if exist "data\maktaba.db" set "TARGET=%cd%\data\maktaba.db"
if not defined TARGET set "TARGET=%APPDATA%\Maktaba\maktaba.db"

if not exist "%APPDATA%\Maktaba" mkdir "%APPDATA%\Maktaba" 2>nul

echo سيتم استبدال: %TARGET%
set /p CONF=اكتب YES للتأكيد: 
if /I not "%CONF%"=="YES" (
  echo أُلغي
  pause
  exit /b 0
)

copy /Y "%BAK%" "%TARGET%" >nul
if exist "%BAK%-wal" del /f /q "%TARGET%-wal" 2>nul
if exist "%BAK%-shm" del /f /q "%TARGET%-shm" 2>nul
del /f /q "%TARGET%-wal" 2>nul
del /f /q "%TARGET%-shm" 2>nul

echo تمت الاستعادة. شغّل البرنامج من جديد.
pause
