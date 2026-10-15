"""Invoice queries. tenant_id always comes from the transaction-local session."""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from allyanna.errors import (
    CorrectingInvoiceExists,
    DuplicateInvoiceNumber,
    IntakeAlreadyPosted,
    InvalidInvoice,
    InvoicePeriodFiled,
)
from allyanna.invoices.models import FiledReturnWindow, Invoice, InvoiceLine, PricedLine
from allyanna.money import as_decimal

Connection = Any

_INVOICE_COLUMNS = """
    id, tenant_id, vendor_name, invoice_number, invoice_date, due_date,
    currency_code, tax_year, country_code, tax_schedule_id,
    subtotal, tot_rate, tot_amount, grand_total, document_intake_id, corrects_return_id
"""


class InvoiceRepository:
    async def insert_invoice(
        self,
        conn: Connection,
        *,
        vendor_name: str,
        invoice_number: str | None,
        invoice_date: date,
        due_date: date | None,
        currency_code: str,
        tax_year: int,
        country_code: str,
        tax_schedule_id: UUID,
        subtotal: Decimal,
        tot_rate: Decimal,
        tot_amount: Decimal,
        grand_total: Decimal,
        lines: tuple[PricedLine, ...],
        document_intake_id: UUID | None = None,
        corrects_return_id: UUID | None = None,
    ) -> Invoice:
        try:
            header = await conn.fetchrow(
                f"""
                INSERT INTO allyanna.invoices (
                  tenant_id, vendor_name, invoice_number, invoice_date, due_date,
                  currency_code, tax_year, country_code, tax_schedule_id,
                  subtotal, tot_rate, tot_amount, grand_total, document_intake_id,
                  corrects_return_id
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                )
                RETURNING {_INVOICE_COLUMNS}
                """,
                vendor_name,
                invoice_number,
                invoice_date,
                due_date,
                currency_code,
                tax_year,
                country_code,
                tax_schedule_id,
                subtotal,
                tot_rate,
                tot_amount,
                grand_total,
                document_intake_id,
                corrects_return_id,
            )
        except asyncpg.UniqueViolationError as exc:
            if exc.constraint_name == "invoices_document_intake_idx":
                raise IntakeAlreadyPosted("This intake is already posted to the ledger") from exc
            if exc.constraint_name == "invoices_one_correction_per_return":
                raise CorrectingInvoiceExists("This filing already has a correcting invoice") from exc
            raise DuplicateInvoiceNumber(
                "An invoice with this number already exists for the business"
            ) from exc
        except asyncpg.RaiseError as exc:
            message = str(exc)
            if "filed period" in message:
                raise InvoicePeriodFiled(
                    "This invoice date falls in a period that is already filed"
                ) from exc
            if "does not belong" in message:
                raise InvalidInvoice("The correcting invoice does not match the filed return") from exc
            raise
        stored_lines: list[InvoiceLine] = []
        for line in lines:
            row = await conn.fetchrow(
                """
                INSERT INTO allyanna.invoice_lines (
                  tenant_id, invoice_id, line_number, description, quantity, unit_price, line_total
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3, $4, $5, $6
                )
                RETURNING id, line_number, description, quantity, unit_price, line_total
                """,
                header["id"],
                line.line_number,
                line.description,
                line.quantity,
                line.unit_price,
                line.line_total,
            )
            stored_lines.append(_line_from_row(row))
        return _invoice_from_row(header, tuple(stored_lines))

    async def filed_period_covers(
        self,
        conn: Connection,
        invoice_date: date,
        country_code: str,
    ) -> bool:
        found = await conn.fetchval(
            """
            SELECT 1
            FROM allyanna.tot_returns
            WHERE tenant_id = current_setting('allyanna.tenant_id', true)::uuid
              AND country_code = $1
              AND period_start <= $2
              AND period_end >= $2
            LIMIT 1
            """,
            country_code,
            invoice_date,
        )
        return found is not None

    async def get_filed_return(self, conn: Connection, return_id: UUID) -> FiledReturnWindow | None:
        row = await conn.fetchrow(
            """
            SELECT
              filed.country_code,
              filed.tax_year,
              filed.period_start,
              filed.period_end,
              EXISTS (
                SELECT 1
                FROM allyanna.tot_returns AS later
                WHERE later.amends_return_id = filed.id
                  AND later.tenant_id = filed.tenant_id
              ) AS superseded
            FROM allyanna.tot_returns AS filed
            WHERE filed.id = $1
              AND filed.tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            return_id,
        )
        if row is None:
            return None
        return FiledReturnWindow(
            country_code=row["country_code"],
            tax_year=row["tax_year"],
            period_start=row["period_start"],
            period_end=row["period_end"],
            superseded=bool(row["superseded"]),
        )

    async def correction_exists(self, conn: Connection, return_id: UUID) -> bool:
        found = await conn.fetchval(
            """
            SELECT 1
            FROM allyanna.invoices
            WHERE corrects_return_id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            LIMIT 1
            """,
            return_id,
        )
        return found is not None

    async def list_invoices(self, conn: Connection) -> tuple[Invoice, ...]:
        headers = await conn.fetch(
            f"""
            SELECT {_INVOICE_COLUMNS}
            FROM allyanna.invoices
            WHERE tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY invoice_date DESC, created_at DESC
            """
        )
        return await self._with_lines(conn, headers)

    async def get_invoice(self, conn: Connection, invoice_id: UUID) -> Invoice | None:
        header = await conn.fetchrow(
            f"""
            SELECT {_INVOICE_COLUMNS}
            FROM allyanna.invoices
            WHERE id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            invoice_id,
        )
        if header is None:
            return None
        invoices = await self._with_lines(conn, [header])
        return invoices[0]

    async def find_posted_intake(self, conn: Connection, document_id: UUID) -> UUID | None:
        return await conn.fetchval(
            """
            SELECT id
            FROM allyanna.invoices
            WHERE document_intake_id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            document_id,
        )

    async def _with_lines(self, conn: Connection, headers: list[Any]) -> tuple[Invoice, ...]:
        if not headers:
            return ()
        ids = [row["id"] for row in headers]
        line_rows = await conn.fetch(
            """
            SELECT id, invoice_id, line_number, description, quantity, unit_price, line_total
            FROM allyanna.invoice_lines
            WHERE invoice_id = ANY($1::uuid[])
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY line_number
            """,
            ids,
        )
        grouped: dict[UUID, list[InvoiceLine]] = {row["id"]: [] for row in headers}
        for row in line_rows:
            grouped[row["invoice_id"]].append(_line_from_row(row))
        return tuple(
            _invoice_from_row(header, tuple(grouped[header["id"]]))
            for header in headers
        )


def _line_from_row(row: Any) -> InvoiceLine:
    return InvoiceLine(
        id=row["id"],
        line_number=row["line_number"],
        description=row["description"],
        quantity=as_decimal(row["quantity"]),
        unit_price=as_decimal(row["unit_price"]),
        line_total=as_decimal(row["line_total"]),
    )


def _invoice_from_row(row: Any, lines: tuple[InvoiceLine, ...]) -> Invoice:
    return Invoice(
        id=row["id"],
        tenant_id=row["tenant_id"],
        vendor_name=row["vendor_name"],
        invoice_number=row["invoice_number"],
        invoice_date=row["invoice_date"],
        due_date=row["due_date"],
        currency_code=row["currency_code"],
        tax_year=row["tax_year"],
        country_code=row["country_code"],
        tax_schedule_id=row["tax_schedule_id"],
        subtotal=as_decimal(row["subtotal"]),
        tot_rate=as_decimal(row["tot_rate"]),
        tot_amount=as_decimal(row["tot_amount"]),
        grand_total=as_decimal(row["grand_total"]),
        document_intake_id=row["document_intake_id"],
        corrects_return_id=row["corrects_return_id"],
        lines=lines,
    )
