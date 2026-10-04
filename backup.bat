@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "backups\" mkdir backups
if not exist "data\maktaba.db" (
  echo لا يوجد ملف data\maktaba.db بعد
  pause
  exit /b 1
)
set TS=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TS=%TS: =0%
copy /Y "data\maktaba.db" "backups\maktaba_%TS%.db" >nul
echo تم النسخ: backups\maktaba_%TS%.db
pause
