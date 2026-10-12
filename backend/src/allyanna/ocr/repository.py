"""Intake queries. tenant_id always comes from the transaction-local session."""

import json
from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from allyanna.money import as_decimal
from allyanna.ocr.models import ClaimedUpload, DocumentIntake, IntakeLine

Connection = Any


class DocumentRepository:
    async def insert_queued(
        self,
        conn: Connection,
        *,
        source_filename: str,
        content_type: str,
        content: bytes,
    ) -> DocumentIntake:
        row = await conn.fetchrow(
            """
            INSERT INTO allyanna.document_intakes (
              tenant_id, actor_user_id, status, source_filename, content_type, byte_size, content
            )
            VALUES (
              current_setting('allyanna.tenant_id', true)::uuid,
              current_setting('allyanna.user_id', true)::uuid,
              'queued', $1, $2, $3, $4
            )
            RETURNING id, tenant_id, status, source_filename, content_type,
                      vendor_name, invoice_date, currency_code, tax_year, country_code,
                      tax_schedule_id, extracted_subtotal, extracted_tot_amount,
                      extracted_grand_total, subtotal, tot_rate, tot_amount, grand_total,
                      amounts_match, discrepancies, error_message, created_at, completed_at
            """,
            source_filename,
            content_type,
            len(content),
            content,
        )
        return _document_from_row(row, ())

    async def claim(self, conn: Connection, document_id: UUID) -> ClaimedUpload | None:
        row = await conn.fetchrow(
            """
            UPDATE allyanna.document_intakes
            SET status = 'processing'
            WHERE id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
              AND status = 'queued'
            RETURNING content, content_type, source_filename
            """,
            document_id,
        )
        if row is None:
            return None
        return ClaimedUpload(
            content=bytes(row["content"]),
            content_type=row["content_type"],
            source_filename=row["source_filename"],
        )

    async def complete(
        self,
        conn: Connection,
        *,
        document_id: UUID,
        vendor_name: str,
        invoice_date: date,
        currency_code: str,
        tax_year: int,
        country_code: str,
        tax_schedule_id: UUID,
        extracted_subtotal: Decimal,
        extracted_tot_amount: Decimal,
        extracted_grand_total: Decimal,
        subtotal: Decimal,
        tot_rate: Decimal,
        tot_amount: Decimal,
        grand_total: Decimal,
        amounts_match: bool,
        discrepancies: tuple[str, ...],
        lines: tuple[IntakeLine, ...],
    ) -> None:
        updated = await conn.fetchrow(
            """
            UPDATE allyanna.document_intakes
            SET status = 'completed',
                vendor_name = $2,
                invoice_date = $3,
                currency_code = $4,
                tax_year = $5,
                country_code = $6,
                tax_schedule_id = $7,
                extracted_subtotal = $8,
                extracted_tot_amount = $9,
                extracted_grand_total = $10,
                subtotal = $11,
                tot_rate = $12,
                tot_amount = $13,
                grand_total = $14,
                amounts_match = $15,
                discrepancies = $16::jsonb,
                completed_at = now()
            WHERE id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
              AND status = 'processing'
            RETURNING id
            """,
            document_id,
            vendor_name,
            invoice_date,
            currency_code,
            tax_year,
            country_code,
            tax_schedule_id,
            extracted_subtotal,
            extracted_tot_amount,
            extracted_grand_total,
            subtotal,
            tot_rate,
            tot_amount,
            grand_total,
            amounts_match,
            json.dumps(list(discrepancies)),
        )
        if updated is None:
            return
        for line in lines:
            await conn.execute(
                """
                INSERT INTO allyanna.document_intake_lines (
                  tenant_id, document_intake_id, line_number, description, quantity,
                  unit_price, extracted_line_total, line_total
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3, $4, $5, $6, $7
                )
                """,
                document_id,
                line.line_number,
                line.description,
                line.quantity,
                line.unit_price,
                line.extracted_line_total,
                line.line_total,
            )

    async def fail(self, conn: Connection, document_id: UUID, message: str) -> None:
        await conn.execute(
            """
            UPDATE allyanna.document_intakes
            SET status = 'failed',
                error_message = $2,
                completed_at = now()
            WHERE id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
              AND status IN ('queued', 'processing')
            """,
            document_id,
            message[:500],
        )

    async def list_documents(self, conn: Connection) -> tuple[DocumentIntake, ...]:
        rows = await conn.fetch(
            """
            SELECT id, tenant_id, status, source_filename, content_type,
                   vendor_name, invoice_date, currency_code, tax_year, country_code,
                   tax_schedule_id, extracted_subtotal, extracted_tot_amount,
                   extracted_grand_total, subtotal, tot_rate, tot_amount, grand_total,
                   amounts_match, discrepancies, error_message, created_at, completed_at
            FROM allyanna.document_intakes
            WHERE tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY created_at DESC
            """
        )
        return await self._hydrate(conn, rows)

    async def get_document(self, conn: Connection, document_id: UUID) -> DocumentIntake | None:
        row = await conn.fetchrow(
            """
            SELECT id, tenant_id, status, source_filename, content_type,
                   vendor_name, invoice_date, currency_code, tax_year, country_code,
                   tax_schedule_id, extracted_subtotal, extracted_tot_amount,
                   extracted_grand_total, subtotal, tot_rate, tot_amount, grand_total,
                   amounts_match, discrepancies, error_message, created_at, completed_at
            FROM allyanna.document_intakes
            WHERE id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            document_id,
        )
        if row is None:
            return None
        hydrated = await self._hydrate(conn, [row])
        return hydrated[0]

    async def _hydrate(self, conn: Connection, rows: Any) -> tuple[DocumentIntake, ...]:
        if not rows:
            return ()
        document_ids = [row["id"] for row in rows]
        line_rows = await conn.fetch(
            """
            SELECT document_intake_id, line_number, description, quantity, unit_price,
                   extracted_line_total, line_total
            FROM allyanna.document_intake_lines
            WHERE document_intake_id = ANY($1::uuid[])
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY line_number
            """,
            document_ids,
        )
        grouped: dict[UUID, list[IntakeLine]] = {}
        for row in line_rows:
            grouped.setdefault(row["document_intake_id"], []).append(_line_from_row(row))
        return tuple(
            _document_from_row(row, tuple(grouped.get(row["id"], [])))
            for row in rows
        )


def _document_from_row(row: Any, lines: tuple[IntakeLine, ...]) -> DocumentIntake:
    return DocumentIntake(
        id=row["id"],
        tenant_id=row["tenant_id"],
        status=row["status"],
        source_filename=row["source_filename"],
        content_type=row["content_type"],
        vendor_name=row["vendor_name"],
        invoice_date=row["invoice_date"],
        currency_code=row["currency_code"],
        tax_year=row["tax_year"],
        country_code=row["country_code"],
        tax_schedule_id=row["tax_schedule_id"],
        extracted_subtotal=_money(row["extracted_subtotal"]),
        extracted_tot_amount=_money(row["extracted_tot_amount"]),
        extracted_grand_total=_money(row["extracted_grand_total"]),
        subtotal=_money(row["subtotal"]),
        tot_rate=_money(row["tot_rate"]),
        tot_amount=_money(row["tot_amount"]),
        grand_total=_money(row["grand_total"]),
        amounts_match=row["amounts_match"],
        discrepancies=_discrepancies(row["discrepancies"]),
        error_message=row["error_message"],
        lines=lines,
        created_at=row["created_at"],
        completed_at=row["completed_at"],
    )


def _line_from_row(row: Any) -> IntakeLine:
    return IntakeLine(
        line_number=row["line_number"],
        description=row["description"],
        quantity=as_decimal(row["quantity"]),
        unit_price=as_decimal(row["unit_price"]),
        extracted_line_total=_money(row["extracted_line_total"]),
        line_total=as_decimal(row["line_total"]),
    )


def _money(value: object) -> Decimal | None:
    if value is None:
        return None
    return as_decimal(value)


def _discrepancies(value: object) -> tuple[str, ...]:
    if value is None:
        return ()
    parsed = json.loads(value) if isinstance(value, str) else value
    return tuple(str(item) for item in parsed)
