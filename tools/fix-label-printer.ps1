#Requires -Version 5.1
<#
  ضبط طابعة ملصقات Xprinter (XP-Q371U / مشابه) لستيكر 38×25 مم
  وتشغيل اختبار طباعة (مربع أسود + نص) للتأكد أن الرأس الحراري يطبع.
#>
$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  ضبط طابعة الملصقات 38x25 مم" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1) إيجاد الطابعة
$printers = @()
try {
  $printers = @(Get-Printer -ErrorAction Stop)
} catch {
  Write-Host "تعذر قراءة قائمة الطابعات: $_" -ForegroundColor Red
  Write-Host "شغّل PowerShell كمسؤول إن لزم." -ForegroundColor Yellow
  exit 1
}

$match = $printers | Where-Object {
  $_.Name -match 'XP-?Q|Xprinter|371|380|Q371|label|ملصق'
} | Select-Object -First 1

if (-not $match) {
  Write-Host "لم يتم العثور على طابعة Xprinter تلقائيًا." -ForegroundColor Yellow
  Write-Host "الطابعات المتاحة:" -ForegroundColor Yellow
  $i = 1
  foreach ($p in $printers) {
    Write-Host ("  [{0}] {1}" -f $i, $p.Name)
    $i++
  }
  $choice = Read-Host "اكتب رقم الطابعة أو الاسم الكامل"
  if ($choice -match '^\d+$') {
    $idx = [int]$choice - 1
    if ($idx -ge 0 -and $idx -lt $printers.Count) { $match = $printers[$idx] }
  } else {
    $match = $printers | Where-Object { $_.Name -eq $choice } | Select-Object -First 1
  }
}

if (-not $match) {
  Write-Host "لم يتم اختيار طابعة." -ForegroundColor Red
  exit 1
}

$printerName = $match.Name
Write-Host ("الطابعة: {0}" -f $printerName) -ForegroundColor Green

# 2) تعيين كافتراضي
try {
  $null = (Get-CimInstance -ClassName Win32_Printer -Filter "Name='$($printerName.Replace("'","''"))'")
  $ws = New-Object -ComObject WScript.Network
  $ws.SetDefaultPrinter($printerName)
  Write-Host "تم تعيينها كطابعة افتراضية." -ForegroundColor Green
} catch {
  Write-Host ("تعذر تعيين الافتراضي: {0}" -f $_) -ForegroundColor Yellow
}

# 3) محاولة ضبط الإعدادات العامة
try {
  Set-PrintConfiguration -PrinterName $printerName -PaperSize Letter -ErrorAction SilentlyContinue | Out-Null
} catch {}

# 4) فتح نافذة تفضيلات الطباعة ليختار Stock 38x25 يدويًا (Seagull غالبًا يحتاج ذلك)
Write-Host ""
Write-Host "سيتم فتح إعدادات الطابعة..." -ForegroundColor Cyan
Write-Host "اضبط يدويًا (مهم):" -ForegroundColor Yellow
Write-Host "  Stock / Media Size : 38x25" -ForegroundColor Yellow
Write-Host "  Orientation        : Portrait (أو Landscape لو فاضي)" -ForegroundColor Yellow
Write-Host "  Mirror / Negative  : OFF" -ForegroundColor Yellow
Write-Host "  Type               : Labels With Gaps" -ForegroundColor Yellow
Write-Host "  Gap Height         : 0.08 in" -ForegroundColor Yellow
Write-Host ""
try {
  Start-Process "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry /e /n `"$printerName`""
} catch {
  Write-Host "تعذر فتح الإعدادات تلقائيًا — افتحها من أجهزة وطابعات." -ForegroundColor Yellow
}

Write-Host "بعد ما تضبط وتضغط OK/Apply في النافذة، اضغط Enter هنا للمتابعة..." -ForegroundColor Cyan
$null = Read-Host

# 5) اختبار طباعة: صورة PNG بسيطة (مربع أسود + نص) عبر GDI بمقاس 38x25
Write-Host "جاري إرسال اختبار طباعة (مربع أسود)..." -ForegroundColor Cyan

Add-Type -AssemblyName System.Drawing

$tmpDir = Join-Path $env:TEMP "maktaba-printer-fix"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$pngPath = Join-Path $tmpDir "test-label.png"

# صورة 38x25 مم @ 203 DPI ≈ 304 x 200 بكسل
$dpi = 203
$w = [int][Math]::Round(38 / 25.4 * $dpi)
$h = [int][Math]::Round(25 / 25.4 * $dpi)
$bmp = New-Object System.Drawing.Bitmap $w, $h
$bmp.SetResolution($dpi, $dpi)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 4
$g.DrawRectangle($pen, 4, 4, $w - 9, $h - 9)
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
$font = New-Object System.Drawing.Font "Arial", 14, ([System.Drawing.FontStyle]::Bold)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF 0, 0, $w, $h
$g.DrawString("TEST 38x25", $font, $brush, $rect, $sf)
$g.Dispose()
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$paperW = [int][Math]::Round(38 / 25.4 * 100)
$paperH = [int][Math]::Round(25 / 25.4 * 100)

$printOk = $false
try {
  $img = [System.Drawing.Image]::FromFile($pngPath)
  $pd = New-Object System.Drawing.Printing.PrintDocument
  $pd.PrinterSettings.PrinterName = $printerName
  if (-not $pd.PrinterSettings.IsValid) { throw "الطابعة غير صالحة: $printerName" }
  $pd.DocumentName = "MaktabaTestLabel"
  $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  try {
    $psize = New-Object System.Drawing.Printing.PaperSize "Maktaba38x25", $paperW, $paperH
    $psize.RawKind = 256
    $pd.DefaultPageSettings.PaperSize = $psize
  } catch {}
  $script:imgRef = $img
  $pd.add_PrintPage({
    param($sender, $e)
    $e.Graphics.DrawImage($script:imgRef, $e.MarginBounds)
    $e.HasMorePages = $false
  })
  $pd.Print()
  $img.Dispose()
  $printOk = $true
  Write-Host "تم إرسال اختبار الطباعة." -ForegroundColor Green
} catch {
  Write-Host ("فشل اختبار GDI: {0}" -f $_) -ForegroundColor Red
  # محاولة بديلة: Photo Viewer
  try {
    $cmd = 'rundll32.exe shimgvw.dll,ImageView_PrintTo "' + $pngPath + '" "' + $printerName + '"'
    cmd /c $cmd
    Start-Sleep -Seconds 2
    Write-Host "تم إرسال الاختبار عبر عارض الصور." -ForegroundColor Green
    $printOk = $true
  } catch {
    Write-Host ("فشل البديل أيضًا: {0}" -f $_) -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($printOk) {
  Write-Host "انظر للستيكر:" -ForegroundColor Cyan
  Write-Host "  - لو ظهر مربع أسود + TEST 38x25 = الطابعة تطبع صح، والمشكلة كانت من المقاس/المحتوى." -ForegroundColor Green
  Write-Host "  - لو الستيكر أبيض تمامًا = المشكلة من الدرايفر/الرول/الحرارة (مش البرنامج)." -ForegroundColor Yellow
  Write-Host "    جرّب Orientation = Landscape في إعدادات الطابعة، أو غيّر الرول، أو أعد تثبيت درايفر Xprinter." -ForegroundColor Yellow
} else {
  Write-Host "لم تنجح أي طريقة طباعة. تأكد أن الطابعة Online ومن غير إيقاف مؤقت." -ForegroundColor Red
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "اضغط Enter للخروج..."
$null = Read-Host
