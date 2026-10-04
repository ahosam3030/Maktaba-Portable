@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo تحذير: سيمسح كل البيانات وينشئ مالك جديد.
set /p CONFIRM=اكتب YES للتأكيد: 
if /I not "%CONFIRM%"=="YES" (
  echo تم الإلغاء
  pause
  exit /b 1
)
set /p ADMIN_EMAIL=البريد: 
set /p ADMIN_PASS=كلمة المرور (كبير+صغير+رقم+رمز): 
set SEED_CONFIRM=YES
set SEED_OWNER_EMAIL=%ADMIN_EMAIL%
set SEED_OWNER_PASSWORD=%ADMIN_PASS%
cd apps\api
if not exist "node_modules\" call npm install
call npx prisma generate
call npx prisma db push --skip-generate
call npm run seed
cd ..\..
pause
