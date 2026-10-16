#Requires -Version 5.1
# Fix Xprinter label printer for 38x25 mm stickers + send a test label
$ErrorActionPreference = 'Continue'

Write-Host ""
Write-Host "========================================"
Write-Host "  Label printer setup 38x25 mm"
Write-Host "========================================"
Write-Host ""

$printers = @()
try {
  $printers = @(Get-Printer -ErrorAction Stop)
} catch {
  Write-Host "Cannot list printers: $_"
  Write-Host "Try running as Administrator."
  exit 1
}

$match = $printers | Where-Object {
  $_.Name -match 'XP-?Q|Xprinter|371|380|Q371|label'
} | Select-Object -First 1

if (-not $match) {
  Write-Host "Xprinter not auto-detected. Available printers:"
  $i = 1
  foreach ($p in $printers) {
    Write-Host ("  [{0}] {1}" -f $i, $p.Name)
    $i++
  }
  $choice = Read-Host "Enter printer number or full name"
  if ($choice -match '^\d+$') {
    $idx = [int]$choice - 1
    if ($idx -ge 0 -and $idx -lt $printers.Count) { $match = $printers[$idx] }
  } else {
    $match = $printers | Where-Object { $_.Name -eq $choice } | Select-Object -First 1
  }
}

if (-not $match) {
  Write-Host "No printer selected."
  exit 1
}

$printerName = $match.Name
Write-Host ("Printer: {0}" -f $printerName)

try {
  $ws = New-Object -ComObject WScript.Network
  $ws.SetDefaultPrinter($printerName)
  Write-Host "Set as default printer."
} catch {
  Write-Host ("Could not set default: {0}" -f $_)
}

Write-Host ""
Write-Host "Opening printer preferences..."
Write-Host "Set these options then click OK/Apply:"
Write-Host "  Stock / Media Size : 38x25"
Write-Host "  Orientation        : Portrait (try Landscape if blank)"
Write-Host "  Mirror / Negative  : OFF"
Write-Host "  Type               : Labels With Gaps"
Write-Host "  Gap Height         : 0.08 in"
Write-Host ""

try {
  Start-Process "rundll32.exe" -ArgumentList "printui.dll,PrintUIEntry /e /n `"$printerName`""
} catch {
  Write-Host "Could not open preferences UI."
}

Write-Host "After you click OK/Apply in the printer window, press Enter here..."
$null = Read-Host

Write-Host "Sending TEST label (black box + text)..."

Add-Type -AssemblyName System.Drawing

$tmpDir = Join-Path $env:TEMP "maktaba-printer-fix"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
$pngPath = Join-Path $tmpDir "test-label.png"

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
  if (-not $pd.PrinterSettings.IsValid) { throw ("Printer not valid: " + $printerName) }
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
  Write-Host "Test print sent (GDI)."
} catch {
  Write-Host ("GDI test failed: {0}" -f $_)
  try {
    $cmd = 'rundll32.exe shimgvw.dll,ImageView_PrintTo "' + $pngPath + '" "' + $printerName + '"'
    cmd /c $cmd
    Start-Sleep -Seconds 2
    Write-Host "Test print sent (Photo Viewer)."
    $printOk = $true
  } catch {
    Write-Host ("Photo Viewer also failed: {0}" -f $_)
  }
}

Write-Host ""
Write-Host "========================================"
if ($printOk) {
  Write-Host "Check the sticker:"
  Write-Host "  - Black box + TEST 38x25 = printer OK"
  Write-Host "  - Fully white = driver/roll/orientation issue"
  Write-Host "    Try Orientation = Landscape, then re-run this script."
} else {
  Write-Host "No print method succeeded. Check printer is Online."
}
Write-Host "========================================"
Write-Host ""
Write-Host "Press Enter to exit..."
$null = Read-Host
