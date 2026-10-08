@echo off
cd /d "%~dp0"
if exist "%~dp0تشغيل التطبيق.vbs" (
  wscript //nologo "%~dp0تشغيل التطبيق.vbs"
) else (
  call "%~dp0start-desktop.bat"
)
exit
