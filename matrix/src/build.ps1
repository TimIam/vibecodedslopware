# Builds matrix/MatrixRain.scr from MatrixRain.cs using the C# compiler that ships with
# every Windows install (.NET Framework 4.x). No SDK, no NuGet, no build step beyond this.
#   powershell -File matrix/src/build.ps1
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework64\v4*\csc.exe" | Select-Object -Last 1 -ExpandProperty FullName
if (-not $csc) { $csc = Get-ChildItem "$env:WINDIR\Microsoft.NET\Framework\v4*\csc.exe" | Select-Object -Last 1 -ExpandProperty FullName }
if (-not $csc) { throw "csc.exe not found: .NET Framework 4.x is missing from this Windows install" }
$out = Join-Path (Split-Path -Parent $here) "MatrixRain.scr"
& $csc /nologo /target:winexe /platform:anycpu /optimize+ /warn:3 /out:"$out" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll "$here\MatrixRain.cs"
if ($LASTEXITCODE -ne 0) { throw "compile failed" }
"built $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
