# Builds antfarm/AntFarm.scr and AntFarm.exe from AntFarm.cs and ../farm.html, using the C# compiler
# that ships with every Windows install (.NET Framework 4.x). No SDK, no NuGet.
#   powershell -File antfarm/src/build.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $here
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe" | Select-Object -Last 1 -ExpandProperty FullName
if (-not $csc) { $csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework\v4*\csc.exe" | Select-Object -Last 1 -ExpandProperty FullName }
if (-not $csc) { throw "csc.exe not found: .NET Framework 4.x is missing from this Windows install" }

# An icon, drawn here: an ant on sand. 48x48, 32-bit, the plain DIB form csc understands.
$ico = Join-Path $here "AntFarm.ico"
Add-Type -AssemblyName System.Drawing
$size = 48
$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)
$sand = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 206, 166, 110))
$g.FillRectangle($sand, 2, 2, 44, 44)
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 28, 20, 16))
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 28, 20, 16)), 1.6
foreach ($l in @(@(21,23,10,14), @(24,23,24,11), @(28,23,38,13), @(21,27,9,35), @(24,27,23,38), @(28,27,39,36))) { $g.DrawLine($pen, $l[0], $l[1], $l[2], $l[3]) }
$g.FillEllipse($dark, 5, 17, 18, 14); $g.FillEllipse($dark, 21, 20, 10, 8); $g.FillEllipse($dark, 30, 17, 13, 13)
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

$out = Join-Path $root "AntFarm.scr"
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /warn:3 /out:"$out" /win32icon:"$ico" `
    "/resource:$root\farm.html,farm.html" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll "$here\AntFarm.cs"
if ($LASTEXITCODE -ne 0) { throw "compile failed" }
Copy-Item $out (Join-Path $root "AntFarm.exe") -Force
"built $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB) and AntFarm.exe"
