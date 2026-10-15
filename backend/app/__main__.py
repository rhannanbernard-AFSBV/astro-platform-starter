"""
PyInstaller / ``python -m app`` entrypoint for Allyanna backend.

Binds loopback only for desktop hardening. Host/port overridable via env.
"""

from __future__ import annotations

import os

import uvicorn


def main() -> None:
    # Desktop default: loopback only (Electron talks to 127.0.0.1).
    host = os.environ.get("ALLYANNA_HOST", "127.0.0.1")
    port = int(os.environ.get("ALLYANNA_PORT", "8000"))
    # Ensure local/SQLite mode when frozen unless explicitly overridden.
    if getattr(__import__("sys"), "frozen", False):
        os.environ.setdefault("ALLYANNA_LOCAL_MODE", "1")
        os.environ.setdefault("ALLYANNA_DB_ENGINE", "sqlite")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        log_level=os.environ.get("ALLYANNA_LOG_LEVEL", "info"),
        # Reload must stay off inside a frozen .exe
        reload=False,
    )


if __name__ == "__main__":
    main()
