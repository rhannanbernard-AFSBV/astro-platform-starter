"""Allyanna Accounting Software — FastAPI entrypoint (cloud + Windows desktop)."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.local_config import get_db_engine, is_local_mode
from app.local_ledger import get_local_db_path, initialize_local_sxm_tables
from app.paths import ensure_allyanna_data_dir, resource_root
from app.routes.compliance import router as compliance_router
from app.routes.invoices import router as invoices_router
from app.routes.payroll import router as payroll_router
from app.routes.tenant import router as tenant_router
from app.schemas import HealthResponse


def _resolve_ui_dir() -> Path | None:
    """Locate packaged Next.js static export (Electron / PyInstaller)."""
    candidates: list[Path] = []
    env_ui = os.environ.get("ALLYANNA_UI_DIR", "").strip()
    if env_ui:
        candidates.append(Path(env_ui))
    # Electron extraResources: resources/ui
    candidates.append(resource_root() / "ui")
    # Sibling of frozen exe: ui/
    if getattr(__import__("sys"), "frozen", False):
        candidates.append(Path(__import__("sys").executable).resolve().parent / "ui")
    # Dev: desktop/ui-dist or frontend/out
    backend_root = Path(__file__).resolve().parent.parent
    repo_root = backend_root.parent
    candidates.append(repo_root / "desktop" / "ui-dist")
    candidates.append(repo_root / "frontend" / "out")

    for path in candidates:
        try:
            resolved = path.expanduser().resolve()
        except OSError:
            continue
        if resolved.is_dir() and (resolved / "index.html").is_file():
            return resolved
    return None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if get_db_engine() == "sqlite":
        ensure_allyanna_data_dir()
        # Frankie: sync init of allyanna_ledger.db + local_* SXM tables
        initialize_local_sxm_tables()
    yield


app = FastAPI(
    title="Allyanna Accounting Software - Sint Maarten Backend",
    description=(
        "Multi-tenant SXM compliance API: tax engine, tenant-scoped sessions "
        "(Postgres RLS or SQLite app isolation), compliance chat, OCR extract, "
        "invoice persist, and monthly payroll run."
    ),
    lifespan=lifespan,
)

# Desktop Electron loads UI from http://127.0.0.1:<port>; allow local origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "null",  # file:// Electron edge cases
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(compliance_router)
app.include_router(tenant_router)
app.include_router(payroll_router)
app.include_router(invoices_router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="allyanna-backend")


@app.get("/api/v1/local/info")
async def local_info() -> dict:
    """Desktop diagnostics — paths only; never returns secrets."""
    info: dict = {
        "local_mode": is_local_mode(),
        "db_engine": get_db_engine(),
    }
    if get_db_engine() == "sqlite":
        info["sqlite_path"] = str(get_local_db_path())
        info["data_dir"] = str(ensure_allyanna_data_dir())
        info["ledger_file"] = "allyanna_ledger.db"
    return info


# Serve Next.js static export when packaged (API routes registered above win).
_ui_dir = _resolve_ui_dir()
if _ui_dir is not None:
    app.mount(
        "/",
        StaticFiles(directory=str(_ui_dir), html=True),
        name="allyanna-ui",
    )
