@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo تحويل شعار El-Mohands إلى icon.ico / icon.png
echo.

where magick >nul 2>&1
if %errorlevel%==0 (
  set IM=magick
) else (
  where convert >nul 2>&1
  if %errorlevel%==0 (set IM=convert) else (
    echo ثبّت ImageMagick من https://imagemagick.org
    echo أو استخدم موقعًا مثل https://convertio.co/png-ico/
    echo ثم سمِّ الملف: icon.ico و icon.png في هذا المجلد
    pause
    exit /b 1
  )
)

set SRC=
if exist "El-Mohands.png" set SRC=El-Mohands.png
if exist "El-Mohands.jpg" set SRC=El-Mohands.jpg
if exist "El-Mohands.jpeg" set SRC=El-Mohands.jpeg
if exist "El-Mohands.webp" set SRC=El-Mohands.webp
if exist "El-Mohands.ico" set SRC=El-Mohands.ico
if "%SRC%"=="" (
  echo لم يُعثر على El-Mohands.png/jpg في مجلد build
  echo ضع ملف الشعار هنا بهذا الاسم ثم أعد التشغيل
  pause
  exit /b 1
)

echo المصدر: %SRC%
%IM% "%SRC%" -resize 512x512 -background none -gravity center -extent 512x512 icon.png
%IM% icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
echo تم: icon.png و icon.ico
echo أعد بناء البرنامج: build-desktop.bat ثم تثبيت البرنامج.bat
pause
