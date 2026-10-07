"""Pillar 2: load configurable SXM tax tables (DB-cache stand-in)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException, status

from app.schemas import TaxRatesSXM, WageTaxBracket

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"


@lru_cache(maxsize=16)
def _load_raw_table(tax_year: int, country_code: str) -> dict:
    path = _DATA_DIR / f"{country_code.lower()}_tax_tables_{tax_year}.json"
    if not path.exists():
        raise FileNotFoundError(path)
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def get_tax_rates(tax_year: int, country_code: str = "SXM") -> TaxRatesSXM:
    """
    Fetch tax rates/brackets indexed by tax_year + country_code.

    Seeds mock SXM 2026 table data as the DB-cache stand-in until Postgres
    tax-table storage is wired.
    """
    try:
        raw = _load_raw_table(tax_year, country_code)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No tax table for country_code={country_code!r} "
                f"tax_year={tax_year}. Seed data under backend/data/."
            ),
        ) from exc

    brackets = [
        WageTaxBracket(up_to=b.get("up_to"), rate=b["rate"])
        for b in raw.get("wage_tax_brackets", [])
    ]
    if not brackets:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Tax table is missing wage_tax_brackets (Pillar 2).",
        )

    return TaxRatesSXM(
        tax_year=int(raw["tax_year"]),
        country_code=str(raw.get("country_code", country_code)),
        tot_percentage=raw["tot_percentage"],
        szv_wage_cap=raw["szv_wage_cap"],
        szv_aov_employer_pct=raw["szv_aov_employer_pct"],
        szv_aov_employee_pct=raw["szv_aov_employee_pct"],
        wage_tax_brackets=brackets,
    )
