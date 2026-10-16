@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Label printer setup 38x25 (Xprinter XP-Q371U)
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\fix-label-printer.ps1"
if errorlevel 1 pause
