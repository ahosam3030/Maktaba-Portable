@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 ( echo ثبّت Node.js 20+ & pause & exit /b 1 )
if not exist "apps\web\dist\index.html" call "%~dp0build-desktop.bat"
if not exist "node_modules\electron\dist\electron.exe" call npm install
if not exist "data\" mkdir data
if not exist "apps\api\.env" copy /Y "apps\api\.env.example" "apps\api\.env" >nul
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
exit /b 0
