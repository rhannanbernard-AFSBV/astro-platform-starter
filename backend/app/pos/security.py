"""PIN hashing and session tokens — never store plaintext PINs."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone


PBKDF2_ITERATIONS = 210_000
SESSION_BYTES = 32


def hash_pin(pin: str, *, salt: bytes | None = None) -> str:
    """Return `pbkdf2$iterations$salt_hex$hash_hex`."""
    if not pin or not pin.isdigit() or not (4 <= len(pin) <= 8):
        raise ValueError("PIN must be 4–8 digits")
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        pin.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_pin(pin: str, encoded: str) -> bool:
    try:
        scheme, iters_s, salt_hex, hash_hex = encoded.split("$", 3)
        if scheme != "pbkdf2":
            return False
        iters = int(iters_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except (ValueError, TypeError):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), salt, iters)
    return hmac.compare_digest(digest, expected)


def new_session_token() -> str:
    return secrets.token_urlsafe(SESSION_BYTES)


def hash_session(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_expiry(hours: float | None = None) -> datetime:
    ttl = hours if hours is not None else float(os.getenv("POS_SESSION_TTL_HOURS", "12"))
    return datetime.now(timezone.utc) + timedelta(hours=ttl)
