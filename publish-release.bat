@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === نشر GitHub Release v1.5.0 ===
echo.
if not exist "release\Maktaba-Setup-1.5.0.exe" (
  echo [خطأ] لا يوجد release\Maktaba-Setup-1.5.0.exe
  echo شغّل أولاً: build-release.bat
  pause
  exit /b 1
)
where gh >nul 2>&1
if errorlevel 1 (
  echo [ملاحظة] GitHub CLI غير مثبت.
  echo ارفع الملف يدوياً من:
  echo https://github.com/ahosam3030/Maktaba-Portable/releases/new
  echo Tag: v1.5.0
  echo File: release\Maktaba-Setup-1.5.0.exe
  start https://github.com/ahosam3030/Maktaba-Portable/releases/new?tag=v1.5.0
  pause
  exit /b 0
)
gh release create v1.5.0 "release\Maktaba-Setup-1.5.0.exe" --title "Maktaba Portable 1.5.0" --notes-file RELEASE-NOTES-1.5.0.md
if errorlevel 1 (
  echo إن وُجد الإصدار مسبقاً: gh release upload v1.5.0 release\Maktaba-Setup-1.5.0.exe --clobber
)
pause
