# Allyanna Accounting — Windows Desktop

Standalone local desktop package: **Electron** shell + **PyInstaller** FastAPI backend + **embedded SQLite**.

| Piece | Path |
|-------|------|
| Electron main / lifecycle | `desktop/main.js` |
| electron-builder (NSIS Setup.exe) | `desktop/package.json` → `build`, `desktop/electron-builder.yml` |
| Electron Forge (alt) | `desktop/forge.config.js` |
| Backend exe spec | `backend/allyanna-backend.spec` |
| SQLite schema | `backend/migrations/sqlite/001_local_schema.sql` |
| Local DB (runtime) | `%LOCALAPPDATA%\Allyanna\local_database.db` |

## Build on Windows (produces `Allyanna_Accounting_Setup.exe`)

Prerequisites: Windows x64, Python 3.11+, Node.js 20+, npm.

```powershell
powershell -ExecutionPolicy Bypass -File desktop\scripts\build-windows.ps1
```

Installer output:

```text
desktop\release\Allyanna_Accounting_Setup.exe
```

### Manual steps (same as the script)

```powershell
# 1) Static UI
cd frontend
$env:ALLYANNA_DESKTOP="1"
$env:NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:8000"
npm ci
npm run build
cd ..
Remove-Item -Recurse -Force desktop\ui-dist -ErrorAction SilentlyContinue
Copy-Item -Recurse frontend\out desktop\ui-dist

# 2) Backend .exe
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
pyinstaller --noconfirm --clean allyanna-backend.spec
deactivate
cd ..
Remove-Item -Recurse -Force desktop\bin -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force desktop\bin | Out-Null
Copy-Item -Recurse backend\dist\allyanna-backend desktop\bin\allyanna-backend

# 3) NSIS installer (preferred)
cd desktop
npm ci
npm run dist
# → release\Allyanna_Accounting_Setup.exe

# Optional: Electron Forge instead of electron-builder
# npm run dist:forge
```

## Linux / this cloud agent

Configs and sources are complete here. A real Windows `.exe` / NSIS installer requires a Windows runner (no self-hosted Windows worker was available). Cross-build via Wine is **not** recommended for Electron + PyInstaller.

CI: see `.github/workflows/windows-desktop.yml` (runs on `windows-latest`).

## Local data & secrets

After install, Allyanna writes:

```text
%USERPROFILE%\AppData\Local\Allyanna\local_database.db
%USERPROFILE%\AppData\Local\Allyanna\config.json   # optional
```

Example `config.json` (OCR / cloud chat only — never commit secrets):

```json
{
  "openai_api_key": "sk-..."
}
```

Core TOT / wage / SZV math and payroll persistence work **offline** with no API key. OCR and GPT chat routing require a key when desired.

## Dev smoke (Linux/macOS)

```bash
export ALLYANNA_LOCAL_MODE=1
export ALLYANNA_DB_ENGINE=sqlite
export ALLYANNA_DATA_DIR=/tmp/allyanna-desktop-test
cd backend && pip install -r requirements.txt && python -m app
# In another terminal:
cd desktop && npm install && npm start
```
