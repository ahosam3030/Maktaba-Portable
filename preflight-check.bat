@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Maktaba Portable preflight 1.5.0 ===
if not exist "apps\api\prisma\migrations\20261008000000_init\migration.sql" (
  echo [FAIL] Missing init migration
  exit /b 1
)
echo [OK] Init migration
if not exist "apps\api\src\version.ts" ( echo [FAIL] version.ts & exit /b 1 )
findstr /C:"1.5.0" "apps\api\src\version.ts" >nul || ( echo [FAIL] version & exit /b 1 )
echo [OK] APP_VERSION 1.5.0
findstr /C:"accept-data-loss" "electron\main.js" >nul && ( echo [FAIL] accept-data-loss still present & exit /b 1 )
echo [OK] No accept-data-loss
findstr /C:"1.5.0" "package.json" >nul || ( echo [FAIL] package.json & exit /b 1 )
echo [OK] package.json
echo === Preflight passed ===
exit /b 0
