@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - استعادة نسخة احتياطية
echo ========================================
echo   استعادة قاعدة البيانات من backups
echo ========================================
echo.
if not exist "backups\" (
  echo لا يوجد مجلد backups
  pause
  exit /b 1
)
echo الملفات المتاحة:
dir /b backups\*.db 2>nul
echo.
set /p F=اكتب اسم الملف من backups (مثال maktaba_20261005.db): 
if not exist "backups\%F%" (
  echo الملف غير موجود
  pause
  exit /b 1
)
if not exist "data\" mkdir data
if exist "data\maktaba.db" (
  set TS=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%
  set TS=%TS: =0%
  copy /Y "data\maktaba.db" "backups\before_restore_%TS%.db" >nul
)
copy /Y "backups\%F%" "data\maktaba.db" >nul
echo تمت الاستعادة. شغّل start-desktop.bat
pause
