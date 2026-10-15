<#
.SYNOPSIS
  Build Allyanna_Accounting_Setup.exe on a Windows machine / CI runner.

.DESCRIPTION
  1) Export Next.js static UI → desktop/ui-dist
  2) PyInstaller → desktop/bin/allyanna-backend/
  3) electron-builder NSIS → desktop/release/Allyanna_Accounting_Setup.exe

  Run from repo root OR from desktop/:
    powershell -ExecutionPolicy Bypass -File desktop\scripts\build-windows.ps1
#>

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopDir = Resolve-Path (Join-Path $ScriptDir "..")
$RepoRoot = Resolve-Path (Join-Path $DesktopDir "..")
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"

Write-Host "==> Repo root: $RepoRoot"

# --- Frontend static export ---
Write-Host "==> Building Next.js static UI"
Push-Location $FrontendDir
$env:ALLYANNA_DESKTOP = "1"
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
if (-not (Test-Path "node_modules")) {
  npm ci
}
npm run build
Pop-Location

$UiSource = Join-Path $FrontendDir "out"
$UiDest = Join-Path $DesktopDir "ui-dist"
if (Test-Path $UiDest) { Remove-Item -Recurse -Force $UiDest }
Copy-Item -Recurse -Force $UiSource $UiDest
Write-Host "==> UI copied to $UiDest"

# --- Backend PyInstaller ---
Write-Host "==> Building allyanna-backend.exe with PyInstaller"
Push-Location $BackendDir
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
& .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pyinstaller --noconfirm --clean allyanna-backend.spec
Deactivate
Pop-Location

$BackendDist = Join-Path $BackendDir "dist\allyanna-backend"
$BinDest = Join-Path $DesktopDir "bin\allyanna-backend"
if (-not (Test-Path (Join-Path $BackendDist "allyanna-backend.exe"))) {
  throw "PyInstaller did not produce allyanna-backend.exe under $BackendDist"
}
if (Test-Path (Join-Path $DesktopDir "bin")) { Remove-Item -Recurse -Force (Join-Path $DesktopDir "bin") }
New-Item -ItemType Directory -Force -Path (Join-Path $DesktopDir "bin") | Out-Null
Copy-Item -Recurse -Force $BackendDist $BinDest
Write-Host "==> Backend copied to $BinDest"

# --- Electron NSIS installer ---
Write-Host "==> Packaging Allyanna_Accounting_Setup.exe"
Push-Location $DesktopDir
if (-not (Test-Path "node_modules")) {
  npm ci
}
npm run dist
Pop-Location

$Setup = Join-Path $DesktopDir "release\Allyanna_Accounting_Setup.exe"
if (-not (Test-Path $Setup)) {
  throw "Installer not found at $Setup"
}
Write-Host "==> SUCCESS: $Setup"
Write-Host "Data directory after install: %LOCALAPPDATA%\Allyanna\allyanna_ledger.db"
