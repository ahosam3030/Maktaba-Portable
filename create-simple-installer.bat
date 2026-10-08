@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - مثبت بسيط
if not exist "release\win-unpacked\Maktaba.exe" (
  echo ابنِ أولاً: npx electron-builder --win dir --x64
  echo أو: build-release.bat
  pause
  exit /b 1
)

set OUT=release\Maktaba-Install-Simple.bat
(
echo @echo off
echo chcp 65001 ^>nul
echo title تثبيت Maktaba
echo echo جاري تثبيت Maktaba...
echo set "DEST=%%LOCALAPPDATA%%\Maktaba"
echo if not exist "%%DEST%%" mkdir "%%DEST%%"
echo xcopy /E /I /Y "%%~dp0win-unpacked\*" "%%DEST%%\" ^>nul
echo powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell^).CreateShortcut([Environment]::GetFolderPath('Desktop'^)+'\Maktaba.lnk'^); $s.TargetPath='%%DEST%%\Maktaba.exe'; $s.WorkingDirectory='%%DEST%%'; $s.Save(^)"
echo echo تم التثبيت. الاختصار على سطح المكتب.
echo start "" "%%DEST%%\Maktaba.exe"
echo pause
) > "%OUT%"

REM Copy installer next to win-unpacked structure for zip distribution
copy /Y "%OUT%" "release\win-unpacked\..\Install-Maktaba.bat" >nul 2>&1
echo.
echo تم إنشاء: release\Maktaba-Install-Simple.bat
echo.
echo للتوزيع: اضغط مجلد release\win-unpacked + ملف Install
echo أو وزّع zip للـ win-unpacked مع Install-Maktaba.bat داخله.
echo.
pause
