# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec — production-hardened Allyanna FastAPI + SQLite backend.

Build on Windows (recommended):
  cd backend
  python -m venv .venv
  .venv\\Scripts\\activate
  pip install -r requirements.txt
  pyinstaller --noconfirm --clean allyanna-backend.spec

Output:
  dist\\allyanna-backend\\allyanna-backend.exe

Path notes:
  - Spec uses pathlib / os.path.join so Windows backslashes resolve correctly.
  - Runtime DB path is NOT bundled; it is created under
    %LOCALAPPDATA%\\Allyanna\\local_database.db by app.paths.
"""

from __future__ import annotations

import os
from pathlib import Path

block_cipher = None

# PyInstaller injects SPEC (absolute path to this .spec file).
SPECDIR = Path(os.path.dirname(os.path.abspath(SPEC))).resolve()  # noqa: F821
BACKEND_ROOT = SPECDIR

datas = [
    (str(BACKEND_ROOT / "data"), "data"),
    (str(BACKEND_ROOT / "migrations" / "sqlite"), os.path.join("migrations", "sqlite")),
]

hiddenimports = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "aiosqlite",
    "app",
    "app.main",
    "app.paths",
    "app.sqlite_db",
    "app.local_config",
    "app.tax_engine",
    "app.tax_tables",
    "app.chat",
    "app.ocr",
    "app.deps",
    "app.db",
    "app.db_tenant",
    "app.schemas",
    "app.routes",
    "app.routes.compliance",
    "app.routes.invoices",
    "app.routes.payroll",
    "app.routes.tenant",
]

a = Analysis(  # noqa: F821
    [str(BACKEND_ROOT / "app" / "__main__.py")],
    pathex=[str(BACKEND_ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Keep Postgres optional for the desktop .exe to shrink the bundle.
        # Server deploys continue to use Docker + psycopg from requirements.txt.
        "psycopg",
        "psycopg_binary",
        "psycopg2",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)  # noqa: F821

exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="allyanna-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # silent background process for Electron
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(  # noqa: F821
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="allyanna-backend",
)
