#Requires -Version 5.1
# Diagnose + test Xprinter label printer (blank sticker troubleshooting)
$ErrorActionPreference = 'Continue'

Write-Host ""
Write-Host "========================================"
Write-Host "  Xprinter blank-label diagnostics"
Write-Host "========================================"
Write-Host ""

$printers = @()
try { $printers = @(Get-Printer -ErrorAction Stop) } catch {
  Write-Host "Cannot list printers: $_"; exit 1
}

$match = $printers | Where-Object { $_.Name -match 'XP-?Q|Xprinter|371|380|Q371|label' } | Select-Object -First 1
if (-not $match) {
  Write-Host "Available printers:"
  $i = 1
  foreach ($p in $printers) { Write-Host ("  [{0}] {1}" -f $i, $p.Name); $i++ }
  $choice = Read-Host "Enter number or full name"
  if ($choice -match '^\d+$') {
    $idx = [int]$choice - 1
    if ($idx -ge 0 -and $idx -lt $printers.Count) { $match = $printers[$idx] }
  } else {
    $match = $printers | Where-Object { $_.Name -eq $choice } | Select-Object -First 1
  }
}
if (-not $match) { Write-Host "No printer selected."; exit 1 }

$printerName = $match.Name
Write-Host ("Printer: {0}" -f $printerName)
Write-Host ("Driver : {0}" -f $match.DriverName)
Write-Host ("Port   : {0}" -f $match.PortName)
Write-Host ("Status : {0}" -f $match.PrinterStatus)

try {
  $ws = New-Object -ComObject WScript.Network
  $ws.SetDefaultPrinter($printerName)
  Write-Host "Set as default."
} catch {}

# Detect Seagull driver (often blanks third-party prints)
$isSeagull = $false
if ($match.DriverName -match 'Seagull|BarTender') {
  $isSeagull = $true
  Write-Host ""
  Write-Host "WARNING: Seagull/BarTender driver detected." -ForegroundColor Yellow
  Write-Host "This driver often prints BLANK from apps other than BarTender." -ForegroundColor Yellow
  Write-Host "Recommended: install official Xprinter driver from xprintertech.com" -ForegroundColor Yellow
  Write-Host ""
}

$tmpDir = Join-Path $env:TEMP "maktaba-printer-fix"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

# --- Test A: Windows printer test page ---
Write-Host ""
Write-Host "[A] Windows built-in test page..."
try {
  $p = Get-CimInstance -ClassName Win32_Printer -Filter ("Name='" + $printerName.Replace("'","''") + "'")
  if ($p) {
    $null = Invoke-CimMethod -InputObject $p -MethodName PrintTestPage
    Write-Host "  Sent Windows test page. Check if ANYTHING printed."
  }
} catch {
  Write-Host ("  Failed: {0}" -f $_)
}

Write-Host "Press Enter after checking the Windows test page..."
$null = Read-Host

# --- Test B: TSPL raw (Xprinter language) ---
Write-Host "[B] TSPL raw command (black box)..."
$tspl = @"
SIZE 38 mm,25 mm
GAP 2 mm,0 mm
DENSITY 15
SPEED 2
DIRECTION 1
REFERENCE 0,0
CLS
BOX 10,10,290,190,5
TEXT 40,70,"3",0,1,1,"TEST"
PRINT 1,1
"@
$tsplPath = Join-Path $tmpDir "test.tspl"
[System.IO.File]::WriteAllText($tsplPath, $tspl.Replace("`n","`r`n"), [System.Text.Encoding]::ASCII)

$tsplOk = $false
# Try copy to printer share
$targets = @(
  ("\\localhost\" + $printerName),
  ("\\" + $env:COMPUTERNAME + "\" + $printerName)
)
foreach ($t in $targets) {
  try {
    $cmd = 'cmd /c copy /B "' + $tsplPath + '" "' + $t + '"'
    Write-Host ("  Trying: {0}" -f $t)
    cmd /c $cmd
    if ($LASTEXITCODE -eq 0) { $tsplOk = $true; Write-Host "  TSPL sent."; break }
  } catch {
    Write-Host ("  {0}" -f $_)
  }
}
if (-not $tsplOk) {
  Write-Host "  TSPL copy failed (driver may block RAW)."
}

Write-Host "Press Enter after checking TSPL result..."
$null = Read-Host

# --- Test C: GDI solid black fill on 38x25 ---
Write-Host "[C] GDI solid black label..."
Add-Type -AssemblyName System.Drawing
$dpi = 203
$w = [int][Math]::Round(38 / 25.4 * $dpi)
$h = [int][Math]::Round(25 / 25.4 * $dpi)
$pngPath = Join-Path $tmpDir "black.png"
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Black)
$g.Dispose()
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$paperW = [int][Math]::Round(38 / 25.4 * 100)
$paperH = [int][Math]::Round(25 / 25.4 * 100)

foreach ($landscape in @($false, $true)) {
  $orient = if ($landscape) { "Landscape" } else { "Portrait" }
  Write-Host ("  GDI {0}..." -f $orient)
  try {
    $img = [System.Drawing.Image]::FromFile($pngPath)
    $pd = New-Object System.Drawing.Printing.PrintDocument
    $pd.PrinterSettings.PrinterName = $printerName
    if (-not $pd.PrinterSettings.IsValid) { throw "invalid printer" }
    $pd.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
    $pd.DefaultPageSettings.Landscape = $landscape
    try {
      $psize = New-Object System.Drawing.Printing.PaperSize "Maktaba38x25", $paperW, $paperH
      $psize.RawKind = 256
      $pd.DefaultPageSettings.PaperSize = $psize
    } catch {}
    $script:imgRef = $img
    $pd.add_PrintPage({
      param($sender, $e)
      $e.Graphics.FillRectangle([System.Drawing.Brushes]::Black, $e.MarginBounds)
      $e.Graphics.DrawImage($script:imgRef, $e.MarginBounds)
      $e.HasMorePages = $false
    })
    $pd.Print()
    $img.Dispose()
    Write-Host ("  Sent GDI {0}." -f $orient)
  } catch {
    Write-Host ("  GDI {0} failed: {1}" -f $orient, $_)
  }
  Write-Host "  Press Enter after checking this sticker..."
  $null = Read-Host
}

Write-Host ""
Write-Host "========================================"
Write-Host "RESULTS GUIDE"
Write-Host "========================================"
Write-Host "If ALL tests are blank:"
Write-Host "  1) Thermal paper may be upside-down (coating side must face head)."
Write-Host "  2) Seagull driver is blocking app prints -> install Xprinter native driver."
Write-Host "  3) Density too low / head dirty / wrong gap sensor."
Write-Host "  4) Try printing from Notepad: open Notepad, type TEST, Print to this printer."
Write-Host ""
Write-Host "Xprinter drivers: https://www.xprintertech.com/ or the USB CD/driver pack."
Write-Host "After installing native driver, re-run this script."
Write-Host ""
Write-Host "Press Enter to exit..."
$null = Read-Host
