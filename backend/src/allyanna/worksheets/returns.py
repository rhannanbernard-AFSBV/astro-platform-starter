"""Filed turnover-tax returns. tenant_id comes from the session."""

from datetime import date
from typing import Any
from uuid import UUID

import asyncpg

from allyanna.errors import TotReturnAlreadyFiled, TotReturnSuperseded
from allyanna.money import as_decimal
from allyanna.worksheets.models import TotReturn, TotWorksheet

Connection = Any

_COLUMNS = """
    id, tenant_id, country_code, tax_year, period_start, period_end,
    currency_code, tax_schedule_id, rate, invoice_count,
    subtotal, tot_amount, grand_total, due_on, amends_return_id, filed_at
"""

_READ_COLUMNS = """
    filed.id, filed.tenant_id, filed.country_code, filed.tax_year,
    filed.period_start, filed.period_end, filed.currency_code, filed.tax_schedule_id,
    filed.rate, filed.invoice_count, filed.subtotal, filed.tot_amount, filed.grand_total,
    filed.due_on, filed.amends_return_id, filed.filed_at,
    EXISTS (
      SELECT 1
      FROM allyanna.tot_returns AS later
      WHERE later.amends_return_id = filed.id
        AND later.tenant_id = filed.tenant_id
    ) AS superseded
"""


class TotReturnRepository:
    async def insert(
        self,
        conn: Connection,
        worksheet: TotWorksheet,
        *,
        due_on: date | None,
        amends_return_id: UUID | None = None,
    ) -> TotReturn:
        try:
            row = await conn.fetchrow(
                f"""
                INSERT INTO allyanna.tot_returns (
                  tenant_id, country_code, tax_year, period_start, period_end,
                  currency_code, tax_schedule_id, rate, invoice_count,
                  subtotal, tot_amount, grand_total, due_on, amends_return_id
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                )
                RETURNING {_COLUMNS}
                """,
                worksheet.country_code,
                worksheet.tax_year,
                worksheet.period_start,
                worksheet.period_end,
                worksheet.currency_code,
                worksheet.schedule_id,
                worksheet.rate,
                worksheet.invoice_count,
                worksheet.subtotal,
                worksheet.tot_amount,
                worksheet.grand_total,
                due_on,
                amends_return_id,
            )
        except asyncpg.UniqueViolationError as exc:
            if exc.constraint_name == "tot_returns_amends_unique":
                raise TotReturnSuperseded("This filing has been amended") from exc
            raise TotReturnAlreadyFiled("This period is already filed") from exc
        except asyncpg.RaiseError as exc:
            if "does not belong" in str(exc):
                raise TotReturnSuperseded("The amendment does not belong to this filing") from exc
            raise
        return _return_from_row(row)

    async def get_return(self, conn: Connection, return_id: UUID) -> TotReturn | None:
        row = await conn.fetchrow(
            f"""
            SELECT {_READ_COLUMNS}
            FROM allyanna.tot_returns AS filed
            WHERE filed.id = $1
              AND filed.tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            return_id,
        )
        if row is None:
            return None
        return _return_from_row(row)

    async def list_returns(self, conn: Connection) -> tuple[TotReturn, ...]:
        rows = await conn.fetch(
            f"""
            SELECT {_READ_COLUMNS}
            FROM allyanna.tot_returns AS filed
            WHERE filed.tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY filed.period_start DESC, filed.period_end DESC, filed.filed_at DESC
            """
        )
        return tuple(_return_from_row(row) for row in rows)

    async def get_successor(self, conn: Connection, return_id: UUID) -> TotReturn | None:
        row = await conn.fetchrow(
            f"""
            SELECT {_READ_COLUMNS}
            FROM allyanna.tot_returns AS filed
            WHERE filed.amends_return_id = $1
              AND filed.tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            return_id,
        )
        if row is None:
            return None
        return _return_from_row(row)


def _return_from_row(row: Any) -> TotReturn:
    return TotReturn(
        id=row["id"],
        tenant_id=row["tenant_id"],
        country_code=row["country_code"],
        tax_year=row["tax_year"],
        period_start=row["period_start"],
        period_end=row["period_end"],
        currency_code=row["currency_code"],
        schedule_id=row["tax_schedule_id"],
        rate=as_decimal(row["rate"]),
        invoice_count=row["invoice_count"],
        subtotal=as_decimal(row["subtotal"]),
        tot_amount=as_decimal(row["tot_amount"]),
        grand_total=as_decimal(row["grand_total"]),
        due_on=row["due_on"],
        amends_return_id=row["amends_return_id"],
        superseded=bool(row["superseded"]) if "superseded" in row.keys() else False,
        filed_at=row["filed_at"],
    )
