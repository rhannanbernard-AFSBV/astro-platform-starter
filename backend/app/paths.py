"""
Resolve Allyanna local data paths (Windows AppData + portable fallbacks).

Desktop default DB location (Windows):
  ``%USERPROFILE%\\AppData\\Local\\Allyanna\\local_database.db``
  (same as ``%LOCALAPPDATA%\\Allyanna\\local_database.db``)

Uses ``pathlib`` so Windows backslashes are handled correctly; never hardcode
forward-slash Absolute AppData paths in callers.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


APP_DIR_NAME = "Allyanna"
DB_FILENAME = "local_database.db"
CONFIG_FILENAME = "config.json"


def is_windows() -> bool:
    return os.name == "nt" or sys.platform.startswith("win")


def get_allyanna_data_dir() -> Path:
    """
    Return the writable Allyanna data directory.

    Preference:
    1. ``ALLYANNA_DATA_DIR`` override (any OS; useful for tests/CI)
    2. Windows: ``%LOCALAPPDATA%\\Allyanna`` (fallback constructed from USERPROFILE)
    3. Non-Windows desktop/dev: ``$XDG_DATA_HOME/Allyanna`` or ``~/.local/share/Allyanna``
    """
    override = os.environ.get("ALLYANNA_DATA_DIR", "").strip()
    if override:
        return Path(override).expanduser().resolve()

    if is_windows():
        local_appdata = os.environ.get("LOCALAPPDATA", "").strip()
        if local_appdata:
            return Path(local_appdata) / APP_DIR_NAME
        userprofile = os.environ.get("USERPROFILE", "").strip()
        if userprofile:
            return Path(userprofile) / "AppData" / "Local" / APP_DIR_NAME
        return Path.home() / "AppData" / "Local" / APP_DIR_NAME

    xdg = os.environ.get("XDG_DATA_HOME", "").strip()
    if xdg:
        return Path(xdg) / APP_DIR_NAME
    return Path.home() / ".local" / "share" / APP_DIR_NAME


def ensure_allyanna_data_dir() -> Path:
    """Create the Allyanna data directory if missing; return it."""
    data_dir = get_allyanna_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_sqlite_db_path() -> Path:
    """
    Absolute path to the embedded SQLite file.

    Override with ``ALLYANNA_SQLITE_PATH`` when needed (tests / portable builds).
    """
    override = os.environ.get("ALLYANNA_SQLITE_PATH", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return ensure_allyanna_data_dir() / DB_FILENAME


def get_local_config_path() -> Path:
    """Path to optional local ``config.json`` (OpenAI key, etc.)."""
    override = os.environ.get("ALLYANNA_CONFIG_PATH", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return ensure_allyanna_data_dir() / CONFIG_FILENAME


def resource_root() -> Path:
    """
    Application resource root (source tree or PyInstaller ``_MEIPASS``).

    When frozen by PyInstaller, bundled ``data/`` and ``migrations/sqlite/``
    live under ``sys._MEIPASS``.
    """
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent.parent


def bundled_sqlite_migration_path() -> Path:
    return resource_root() / "migrations" / "sqlite" / "001_local_schema.sql"


def bundled_tax_data_dir() -> Path:
    return resource_root() / "data"
