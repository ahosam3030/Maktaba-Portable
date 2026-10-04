@echo off
echo إيقاف عمليات Node المتعلقة بالمشروع...
taskkill /FI "WINDOWTITLE eq Maktaba API*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Maktaba Web*" /F >nul 2>&1
echo تم. إن بقيت نوافذ، أغلقها يدويًا.
pause
