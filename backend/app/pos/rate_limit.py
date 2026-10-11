"""In-memory PIN attempt rate limiting (per IP + tenant)."""

from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass


@dataclass
class AttemptWindow:
    failures: list[float]
    locked_until: float = 0.0


_lock = threading.Lock()
_windows: dict[str, AttemptWindow] = {}


def _max_attempts() -> int:
    return max(1, int(os.getenv("POS_PIN_MAX_ATTEMPTS", "5")))


def _window_seconds() -> float:
    return max(30.0, float(os.getenv("POS_PIN_WINDOW_SECONDS", "300")))


def _lockout_seconds() -> float:
    return max(30.0, float(os.getenv("POS_PIN_LOCKOUT_SECONDS", "900")))


def _key(tenant_id: str, client_ip: str) -> str:
    return f"{tenant_id}|{client_ip or 'unknown'}"


def check_login_allowed(tenant_id: str, client_ip: str) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds)."""
    now = time.time()
    key = _key(tenant_id, client_ip)
    with _lock:
        window = _windows.get(key)
        if not window:
            return True, 0
        if window.locked_until > now:
            return False, int(window.locked_until - now) + 1
        cutoff = now - _window_seconds()
        window.failures = [t for t in window.failures if t >= cutoff]
        return True, 0


def record_login_failure(tenant_id: str, client_ip: str) -> tuple[bool, int]:
    """Record a failed PIN. Returns (locked_now, retry_after_seconds)."""
    now = time.time()
    key = _key(tenant_id, client_ip)
    with _lock:
        window = _windows.setdefault(key, AttemptWindow(failures=[]))
        cutoff = now - _window_seconds()
        window.failures = [t for t in window.failures if t >= cutoff]
        window.failures.append(now)
        if len(window.failures) >= _max_attempts():
            window.locked_until = now + _lockout_seconds()
            window.failures.clear()
            return True, int(_lockout_seconds())
        return False, 0


def record_login_success(tenant_id: str, client_ip: str) -> None:
    key = _key(tenant_id, client_ip)
    with _lock:
        _windows.pop(key, None)


def reset_for_tests() -> None:
    with _lock:
        _windows.clear()
