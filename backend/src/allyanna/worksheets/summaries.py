"""Filed annual summaries. tenant_id comes from the session.

The stored tax, amount paid, and balance are copied from the year statement.
This module does not know a tax rate.
"""

from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from allyanna.errors import TotAnnualSummaryAlreadyFiled, TotAnnualSummarySuperseded
from allyanna.money import as_decimal
from allyanna.worksheets.models import TotAnnualSummary

Connection = Any

_COLUMNS = """
    id, tenant_id, country_code, tax_year, currency_code, filing_count,
    tax_due, amount_paid, balance_due, amends_summary_id, filed_at
"""

_READ_COLUMNS = """
    filed.id, filed.tenant_id, filed.country_code, filed.tax_year,
    filed.currency_code, filed.filing_count, filed.tax_due, filed.amount_paid,
    filed.balance_due, filed.amends_summary_id, filed.filed_at,
    EXISTS (
      SELECT 1
      FROM allyanna.tot_annual_summaries AS later
      WHERE later.amends_summary_id = filed.id
        AND later.tenant_id = filed.tenant_id
    ) AS superseded
"""


class TotAnnualSummaryRepository:
    async def insert(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        currency_code: str,
        filing_count: int,
        tax_due: Decimal,
        amount_paid: Decimal,
        balance_due: Decimal,
        amends_summary_id: UUID | None = None,
    ) -> TotAnnualSummary:
        try:
            row = await conn.fetchrow(
                f"""
                INSERT INTO allyanna.tot_annual_summaries (
                  tenant_id, country_code, tax_year, currency_code, filing_count,
                  tax_due, amount_paid, balance_due, amends_summary_id
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3, $4, $5, $6, $7, $8
                )
                RETURNING {_COLUMNS}
                """,
                country_code,
                tax_year,
                currency_code,
                filing_count,
                tax_due,
                amount_paid,
                balance_due,
                amends_summary_id,
            )
        except asyncpg.UniqueViolationError as exc:
            if exc.constraint_name == "tot_annual_summaries_amends_unique":
                raise TotAnnualSummarySuperseded("This annual summary has been amended") from exc
            if exc.constraint_name == "tot_annual_summaries_year_unique":
                raise TotAnnualSummaryAlreadyFiled("This tax year is already summarized") from exc
            raise
        except asyncpg.RaiseError as exc:
            if "does not belong" in str(exc):
                raise TotAnnualSummarySuperseded(
                    "The amendment does not belong to this annual summary"
                ) from exc
            raise
        return _summary_from_row(row)

    async def get_summary(self, conn: Connection, summary_id: UUID) -> TotAnnualSummary | None:
        row = await conn.fetchrow(
            f"""
            SELECT {_READ_COLUMNS}
            FROM allyanna.tot_annual_summaries AS filed
            WHERE filed.id = $1
              AND filed.tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            summary_id,
        )
        if row is None:
            return None
        return _summary_from_row(row)

    async def list_summaries(self, conn: Connection) -> tuple[TotAnnualSummary, ...]:
        rows = await conn.fetch(
            f"""
            SELECT {_READ_COLUMNS}
            FROM allyanna.tot_annual_summaries AS filed
            WHERE filed.tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY filed.tax_year DESC, filed.filed_at DESC
            """
        )
        return tuple(_summary_from_row(row) for row in rows)


def _summary_from_row(row: Any) -> TotAnnualSummary:
    return TotAnnualSummary(
        id=row["id"],
        tenant_id=row["tenant_id"],
        country_code=row["country_code"],
        tax_year=row["tax_year"],
        currency_code=row["currency_code"],
        filing_count=row["filing_count"],
        tax_due=as_decimal(row["tax_due"]),
        amount_paid=as_decimal(row["amount_paid"]),
        balance_due=as_decimal(row["balance_due"]),
        amends_summary_id=row["amends_summary_id"],
        superseded=bool(row["superseded"]) if "superseded" in row.keys() else False,
        filed_at=row["filed_at"],
    )
