@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo تشغيل الواجهة ثم فتح Chrome في وضع التطبيق (أفصل لتقليل تداخل الاختصارات)
start "" cmd /c "cd /d %~dp0 && start.bat"
timeout /t 8 /nobreak >nul
set URL=http://localhost:5173
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=%URL% --disable-extensions --new-window
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app=%URL% --disable-extensions --new-window
) else (
  start %URL%
)
echo إن استمر فتح أدوات المطوّر عند المسح: أعد ضبط Prefix للماسح من دليل الجهاز.
