"""Pillar 2 JSON cache loader keyed by tax_year + country_code."""

from __future__ import annotations

from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.tax_tables import get_tax_rates


def test_json_loader_sxm_2026() -> None:
    rates = get_tax_rates(tax_year=2026, country_code="SXM")
    assert rates.country_code == "SXM"
    assert rates.tax_year == 2026
    assert rates.tot_percentage == Decimal("0.05")
    assert rates.szv_wage_cap == Decimal("5600.00")
    assert len(rates.wage_tax_brackets) >= 2


def test_json_loader_missing_year_404() -> None:
    with pytest.raises(HTTPException) as exc_info:
        get_tax_rates(tax_year=1999, country_code="SXM")
    assert exc_info.value.status_code == 404
