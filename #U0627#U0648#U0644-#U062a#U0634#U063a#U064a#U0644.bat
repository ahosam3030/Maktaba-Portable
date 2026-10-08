@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maktaba - أول تشغيل
echo ========================================
echo   Maktaba Portable — أول تشغيل
echo ========================================
where node >nul 2>&1
if errorlevel 1 ( echo ثبّت Node.js 20+ & pause & exit /b 1 )
if not exist "data\" mkdir data
if not exist "apps\api\.env" copy /Y "apps\api\.env.example" "apps\api\.env" >nul
call "%~dp0build-desktop.bat"
if errorlevel 1 exit /b 1
call "%~dp0seed.bat"
if errorlevel 1 exit /b 1
call "%~dp0start-desktop.bat"
