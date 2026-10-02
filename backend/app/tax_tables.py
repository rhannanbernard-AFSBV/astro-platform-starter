"""
Pillar 2: load configurable SXM tax tables keyed by tax_year + country_code.

Runtime default is the JSON file cache under ``backend/data/``
(``{country_code}_tax_tables_{tax_year}.json``). Postgres tables
``tax_rates`` / ``wage_tax_brackets`` (migration 001) are the durable store;
use :func:`get_tax_rates_from_db` when a live connection is available, or keep
JSON as the local/dev cache loader.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from app.schemas import TaxRatesSXM, WageTaxBracket

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

_SELECT_TAX_RATES = """
    SELECT
        tax_year,
        country_code,
        tot_percentage,
        szv_wage_cap,
        szv_aov_employer_pct,
        szv_aov_employee_pct
    FROM tax_rates
    WHERE tax_year = %s AND country_code = %s
    LIMIT 1;
"""

_SELECT_WAGE_BRACKETS = """
    SELECT up_to, rate
    FROM wage_tax_brackets
    WHERE tax_year = %s AND country_code = %s
    ORDER BY sort_order ASC, up_to ASC NULLS LAST;
"""


@lru_cache(maxsize=16)
def _load_raw_table(tax_year: int, country_code: str) -> dict:
    path = _DATA_DIR / f"{country_code.lower()}_tax_tables_{tax_year}.json"
    if not path.exists():
        raise FileNotFoundError(path)
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def _rates_from_raw(raw: dict, country_code: str) -> TaxRatesSXM:
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


def get_tax_rates(tax_year: int, country_code: str = "SXM") -> TaxRatesSXM:
    """
    Fetch tax rates/brackets indexed by tax_year + country_code from JSON cache.

    Seeds mock SXM 2026 table data as the DB-cache stand-in for unit tests and
    local runs without Postgres. Prefer :func:`get_tax_rates_from_db` in
    production once ``tax_rates`` / ``wage_tax_brackets`` are seeded.
    """
    try:
        raw = _load_raw_table(tax_year, country_code)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No tax table for country_code={country_code!r} "
                f"tax_year={tax_year}. Seed data under backend/data/ "
                f"or load Postgres tax_rates / wage_tax_brackets."
            ),
        ) from exc

    return _rates_from_raw(raw, country_code)


async def get_tax_rates_from_db(
    conn: Any,
    tax_year: int,
    country_code: str = "SXM",
) -> TaxRatesSXM:
    """
    Load Pillar 2 rates from Postgres ``tax_rates`` + ``wage_tax_brackets``.

    Falls back to the JSON cache loader if the DB row is missing (dev convenience).
    """
    result = await conn.execute(_SELECT_TAX_RATES, (tax_year, country_code))
    row = await result.fetchone()
    if row is None:
        return get_tax_rates(tax_year=tax_year, country_code=country_code)

    brackets_result = await conn.execute(
        _SELECT_WAGE_BRACKETS, (tax_year, country_code)
    )
    bracket_rows = await brackets_result.fetchall()
    brackets = [
        WageTaxBracket(up_to=b[0], rate=b[1]) for b in bracket_rows
    ]
    if not brackets:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                f"tax_rates row exists for {country_code}/{tax_year} but "
                "wage_tax_brackets is empty (Pillar 2)."
            ),
        )

    return TaxRatesSXM(
        tax_year=int(row[0]),
        country_code=str(row[1]),
        tot_percentage=row[2],
        szv_wage_cap=row[3],
        szv_aov_employer_pct=row[4],
        szv_aov_employee_pct=row[5],
        wage_tax_brackets=brackets,
    )
