@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba
echo ========================================
echo   Maktaba — تطبيق سطح المكتب
echo ========================================
echo.
echo يتم فتح نافذة البرنامج (ليس المتصفح)...
echo.
call "%~dp0start-desktop.bat"
