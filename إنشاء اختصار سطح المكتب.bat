@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Maktaba.lnk'); $s.TargetPath = '%~dp0تشغيل التطبيق.vbs'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 7; $s.Description = 'Maktaba'; $s.Save(); Write-Host 'تم إنشاء اختصار Maktaba على سطح المكتب'"
pause
