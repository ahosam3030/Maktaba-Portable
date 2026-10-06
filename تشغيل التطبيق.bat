@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba
echo تشغيل تطبيق Maktaba...
call "%~dp0start-desktop.bat"
