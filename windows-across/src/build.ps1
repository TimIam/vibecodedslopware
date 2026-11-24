# Builds windows-across/WindowsAcrossTheStreet.scr from WindowsAcross.cs and ../windows.html
# using the C# compiler that ships with Windows (.NET Framework 4.x). No SDK, no NuGet.
#   powershell -File windows-across/src/build.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here

# Bundle standalone windows.html first if node is available
if (Get-Command node -ErrorAction SilentlyContinue) {
  & node (Join-Path $here "bundle.mjs")
}

$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe" | Select-Object -Last 1 -ExpandProperty FullName
if (-not $csc) { $csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework\v4*\csc.exe" | Select-Object -Last 1 -ExpandProperty FullName }
if (-not $csc) { throw "csc.exe not found: .NET Framework 4.x is missing from this Windows install" }

# Generate 48x48 glowing-windows icon (plain 32-bit DIB ICO for csc.exe)
$ico = Join-Path $here "WindowsAcross.ico"
Add-Type -AssemblyName System.Drawing
$size = 48
$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 8, 13, 26))
$brick = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 44, 32, 36))
$g.FillRectangle($brick, 6, 8, 36, 36)
$warm = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 206, 128))
$cool = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 118, 210, 255))
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 16, 22, 34))
$grid = @(
  @($warm, $dark, $warm),
  @($dark, $cool, $dark),
  @($warm, $warm, $dark),
  @($cool, $dark, $warm)
)
for ($r = 0; $r -lt 4; $r++) {
  for ($c = 0; $c -lt 3; $c++) {
    $g.FillRectangle($grid[$r][$c], 10 + $c * 10, 12 + $r * 8, 7, 5)
  }
}
$g.Dispose()
$ms = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ms
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]1)
$w.Write([byte]$size); $w.Write([byte]$size); $w.Write([byte]0); $w.Write([byte]0); $w.Write([uint16]1); $w.Write([uint16]32)
$mask = [int]([math]::Ceiling($size / 32.0) * 4 * $size)
$w.Write([uint32](40 + $size * $size * 4 + $mask)); $w.Write([uint32]22)
$w.Write([uint32]40); $w.Write([int32]$size); $w.Write([int32]($size * 2)); $w.Write([uint16]1); $w.Write([uint16]32); $w.Write([uint32]0); $w.Write([uint32]($size * $size * 4)); $w.Write([int32]0); $w.Write([int32]0); $w.Write([uint32]0); $w.Write([uint32]0)
for ($y = $size - 1; $y -ge 0; $y--) { for ($x = 0; $x -lt $size; $x++) { $c = $bmp.GetPixel($x, $y); $w.Write([byte]$c.B); $w.Write([byte]$c.G); $w.Write([byte]$c.R); $w.Write([byte]$c.A) } }
$w.Write((New-Object byte[] $mask))
$w.Flush()
[System.IO.File]::WriteAllBytes($ico, $ms.ToArray())
$bmp.Dispose()

$out = Join-Path $root "WindowsAcrossTheStreet.scr"
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /warn:3 /out:"$out" /win32icon:"$ico" `
    "/resource:$root\windows.html,windows.html" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll "$here\WindowsAcross.cs"
if ($LASTEXITCODE -ne 0) { throw "compile failed" }
"Built $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
