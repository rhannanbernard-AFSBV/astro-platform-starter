"""Shared fixtures for Allyanna backend tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure `import app` resolves when running pytest from repo root or backend/
BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.schemas import TaxRatesSXM, WageTaxBracket  # noqa: E402
from app.tax_tables import get_tax_rates  # noqa: E402


@pytest.fixture
def sxm_2026_rates() -> TaxRatesSXM:
    """Seeded mock SXM 2026 table (DB-cache stand-in)."""
    return get_tax_rates(tax_year=2026, country_code="SXM")


@pytest.fixture
def custom_bracket_rates() -> TaxRatesSXM:
    """Rates with explicit brackets to prove math does not use literals."""
    return TaxRatesSXM(
        tax_year=2026,
        country_code="SXM",
        tot_percentage="0.05",
        szv_wage_cap="5600.00",
        szv_aov_employer_pct="0.0825",
        szv_aov_employee_pct="0.0475",
        wage_tax_brackets=[
            WageTaxBracket(up_to="1000.00", rate="0.05"),
            WageTaxBracket(up_to="3000.00", rate="0.15"),
            WageTaxBracket(up_to=None, rate="0.25"),
        ],
    )
