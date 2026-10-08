@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "backups\" mkdir backups

set TS=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TS=%TS: =0%
set "OUT=%cd%\backups\maktaba_%TS%.db"

set "DB="
if exist "%APPDATA%\Maktaba\maktaba.db" set "DB=%APPDATA%\Maktaba\maktaba.db"
if exist "data\maktaba.db" set "DB=%cd%\data\maktaba.db"

if not defined DB (
  echo لا يوجد ملف قاعدة بيانات
  pause
  exit /b 1
)

echo مصدر: %DB%
echo هدف:  %OUT%

REM يفضّل إغلاق البرنامج قبل النسخ لضمان اتساق تام
where node >nul 2>&1
if errorlevel 1 (
  copy /Y "%DB%" "%OUT%" >nul
  if exist "%DB%-wal" copy /Y "%DB%-wal" "%OUT%-wal" >nul
  if exist "%DB%-shm" copy /Y "%DB%-shm" "%OUT%-shm" >nul
  echo تم النسخ (ملف). يُفضّل إغلاق Maktaba أولًا.
  pause
  exit /b 0
)

node scripts\backup-sqlite.js "%DB%" "%OUT%"
if errorlevel 1 (
  echo فشل النسخ الاحتياطي
  pause
  exit /b 1
)
echo تم: %OUT%
pause
