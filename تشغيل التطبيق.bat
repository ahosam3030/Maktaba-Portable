@echo off
REM يفتح البرنامج بدون الإبقاء على نافذة CMD
cd /d "%~dp0"
if exist "%~dp0تشغيل التطبيق.vbs" (
  wscript //nologo "%~dp0تشغيل التطبيق.vbs"
) else (
  call "%~dp0start-desktop.bat"
)
exit
