"""Posted invoices for one period. tenant_id comes from the session."""

from datetime import date
from typing import Any

from allyanna.money import as_decimal
from allyanna.worksheets.models import PeriodInvoice

Connection = Any


class WorksheetRepository:
    async def list_posted_invoices(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        period_start: date,
        period_end: date,
    ) -> tuple[PeriodInvoice, ...]:
        rows = await conn.fetch(
            """
            SELECT id, vendor_name, invoice_date, subtotal, tot_rate, tot_amount, grand_total
            FROM allyanna.invoices
            WHERE tenant_id = current_setting('allyanna.tenant_id', true)::uuid
              AND country_code = $1
              AND tax_year = $2
              AND invoice_date >= $3
              AND invoice_date <= $4
            ORDER BY invoice_date, created_at
            """,
            country_code,
            tax_year,
            period_start,
            period_end,
        )
        return tuple(
            PeriodInvoice(
                id=row["id"],
                vendor_name=row["vendor_name"],
                invoice_date=row["invoice_date"],
                subtotal=as_decimal(row["subtotal"]),
                tot_rate=as_decimal(row["tot_rate"]),
                tot_amount=as_decimal(row["tot_amount"]),
                grand_total=as_decimal(row["grand_total"]),
            )
            for row in rows
        )
