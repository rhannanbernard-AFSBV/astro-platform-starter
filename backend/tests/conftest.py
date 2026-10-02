"""Shared fixtures for payroll monthly-run tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure `import app` resolves when running pytest from repo root or backend/
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.schemas import TaxRatesSXM  # noqa: E402
from app.tax_tables import get_tax_rates  # noqa: E402


@pytest.fixture
def sxm_2026_rates() -> TaxRatesSXM:
    """Seeded mock SXM 2026 table (DB-cache stand-in / Pillar 2)."""
    return get_tax_rates(tax_year=2026, country_code="SXM")
