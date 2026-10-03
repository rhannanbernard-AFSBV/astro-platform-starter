"""
Local desktop configuration (AppData ``config.json``).

Secrets such as ``OPENAI_API_KEY`` are read from:
1. Process environment (``OPENAI_API_KEY`` / ``ALLYANNA_OPENAI_API_KEY``)
2. ``%LOCALAPPDATA%\\Allyanna\\config.json`` (never hardcoded)

Local mode must run without cloud OCR/chat when no key is present.
"""

from __future__ import annotations

import json
import os
from typing import Any

from app.paths import get_local_config_path


def load_local_config() -> dict[str, Any]:
    path = get_local_config_path()
    if not path.is_file():
        return {}
    try:
        with path.open(encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def get_openai_api_key() -> str | None:
    """Return OpenAI API key from env or local config; never a hardcoded secret."""
    for name in ("ALLYANNA_OPENAI_API_KEY", "OPENAI_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value and value != "mock-key":
            return value

    cfg = load_local_config()
    for key in ("openai_api_key", "OPENAI_API_KEY"):
        raw = cfg.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return None


def is_local_mode() -> bool:
    """
    Desktop / embedded SQLite mode.

    Enabled when ``ALLYANNA_LOCAL_MODE`` is truthy, or when the DB engine is
    explicitly ``sqlite``, or when running as a frozen PyInstaller binary.
    """
    flag = os.environ.get("ALLYANNA_LOCAL_MODE", "").strip().lower()
    if flag in {"1", "true", "yes", "on"}:
        return True
    engine = os.environ.get("ALLYANNA_DB_ENGINE", "").strip().lower()
    if engine == "sqlite":
        return True
    import sys

    return bool(getattr(sys, "frozen", False))


def get_db_engine() -> str:
    """Return ``sqlite`` or ``postgres``."""
    explicit = os.environ.get("ALLYANNA_DB_ENGINE", "").strip().lower()
    if explicit in {"sqlite", "postgres", "postgresql"}:
        return "sqlite" if explicit == "postgresql" else explicit
    if is_local_mode():
        return "sqlite"
    # Prefer postgres when a URL is configured; otherwise sqlite for zero-deps.
    if os.environ.get("ALLYANNA_DATABASE_URL") or os.environ.get("DATABASE_URL"):
        return "postgres"
    return "sqlite"
