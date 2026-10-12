"""Accept a file, then extract and recompute it off the request."""

from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

from allyanna.errors import (
    AllyannaError,
    DocumentNotFound,
    ExtractionFailed,
    InvalidDocument,
    InvalidMoney,
    ServiceUnavailable,
)
from allyanna.money import money, require_money
from allyanna.ocr.extractor import DocumentExtractor
from allyanna.ocr.models import DocumentIntake, IntakeLine
from allyanna.ocr.payload import parse_extraction
from allyanna.ocr.price import amount_discrepancies, price_lines
from allyanna.ocr.repository import DocumentRepository
from allyanna.tax.service import TaxService
from allyanna.tenancy.service import TenancyService

Connection = Any

MAX_BYTES = 8_000_000
ACCEPTED_TYPES = ("image/jpeg", "image/png", "image/webp", "application/pdf")


class DocumentIntakeService:
    def __init__(
        self,
        pool: Any,
        repository: DocumentRepository,
        tax: TaxService,
        tenancy: TenancyService,
        extractor_provider: Any,
    ) -> None:
        self._pool = pool
        self._repository = repository
        self._tax = tax
        self._tenancy = tenancy
        self._extractor_provider = extractor_provider

    async def submit(
        self,
        conn: Connection,
        *,
        user_id: UUID,
        filename: str,
        content_type: str,
        content: bytes,
    ) -> DocumentIntake:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        safe_name, safe_type = _validate_upload(filename, content_type, content)
        pool = self._require_pool()
        async with pool.acquire() as write_conn:
            async with write_conn.transaction():
                await self._tenancy.bind_tenant(write_conn, user_id=user_id, tenant_id=tenant.id)
                return await self._repository.insert_queued(
                    write_conn,
                    source_filename=safe_name,
                    content_type=safe_type,
                    content=content,
                )

    async def process(self, document_id: UUID, user_id: UUID, tenant_id: UUID) -> None:
        claimed = await self._claim(document_id, user_id, tenant_id)
        if claimed is None:
            return
        try:
            extractor: DocumentExtractor = self._extractor_provider()
            payload = await extractor.extract(
                content=claimed.content,
                content_type=claimed.content_type,
                filename=claimed.source_filename,
            )
            extracted = parse_extraction(payload)
            priced = price_lines(extracted)
            extracted_subtotal = require_money(Decimal(extracted.subtotal))
            extracted_tot = require_money(Decimal(extracted.tot_amount))
            extracted_grand = require_money(Decimal(extracted.grand_total))
        except (InvalidDocument, InvalidMoney, ExtractionFailed) as exc:
            await self._fail(document_id, user_id, tenant_id, exc.message)
            return
        except Exception:
            await self._fail(document_id, user_id, tenant_id, "Document extraction failed")
            return
        try:
            await self._finish(
                document_id,
                user_id,
                tenant_id,
                vendor_name=extracted.vendor_name.strip(),
                invoice_date=extracted.invoice_date,
                extracted_subtotal=extracted_subtotal,
                extracted_tot_amount=extracted_tot,
                extracted_grand_total=extracted_grand,
                priced=priced,
            )
        except AllyannaError as exc:
            await self._fail(document_id, user_id, tenant_id, exc.message)
        except Exception:
            await self._fail(document_id, user_id, tenant_id, "Document intake failed")

    async def list_documents(self, conn: Connection) -> tuple[DocumentIntake, ...]:
        await self._tenancy.require_active_tenant(conn)
        return await self._repository.list_documents(conn)

    async def get_document(self, conn: Connection, document_id: UUID) -> DocumentIntake:
        await self._tenancy.require_active_tenant(conn)
        found = await self._repository.get_document(conn, document_id)
        if found is None:
            raise DocumentNotFound("Document was not found for the active business")
        return found

    async def _claim(self, document_id: UUID, user_id: UUID, tenant_id: UUID) -> Any:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await self._tenancy.bind_tenant(conn, user_id=user_id, tenant_id=tenant_id)
                return await self._repository.claim(conn, document_id)

    async def _finish(
        self,
        document_id: UUID,
        user_id: UUID,
        tenant_id: UUID,
        *,
        vendor_name: str,
        invoice_date: Any,
        extracted_subtotal: Decimal,
        extracted_tot_amount: Decimal,
        extracted_grand_total: Decimal,
        priced: Any,
    ) -> None:
        pool = self._require_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                tenant = await self._tenancy.bind_tenant(
                    conn,
                    user_id=user_id,
                    tenant_id=tenant_id,
                )
                bundle, tot = await self._tax.calculate_tot_for_bound_tenant(
                    conn,
                    country_code=tenant.country_code,
                    tax_year=invoice_date.year,
                    gross_taxable_revenue=priced.subtotal,
                )
                grand_total = money(priced.subtotal + tot.tot_amount)
                mismatches = amount_discrepancies(
                    extracted_subtotal=extracted_subtotal,
                    extracted_tot_amount=extracted_tot_amount,
                    extracted_grand_total=extracted_grand_total,
                    subtotal=priced.subtotal,
                    tot_amount=tot.tot_amount,
                    grand_total=grand_total,
                    lines=priced.lines,
                )
                lines = tuple(
                    IntakeLine(
                        line_number=index,
                        description=line.description,
                        quantity=line.quantity,
                        unit_price=line.unit_price,
                        extracted_line_total=line.extracted_line_total,
                        line_total=line.line_total,
                    )
                    for index, line in enumerate(priced.lines, start=1)
                )
                await self._repository.complete(
                    conn,
                    document_id=document_id,
                    vendor_name=vendor_name,
                    invoice_date=invoice_date,
                    currency_code=bundle.schedule.currency_code,
                    tax_year=bundle.schedule.tax_year,
                    country_code=bundle.schedule.country_code,
                    tax_schedule_id=bundle.schedule.id,
                    extracted_subtotal=extracted_subtotal,
                    extracted_tot_amount=extracted_tot_amount,
                    extracted_grand_total=extracted_grand_total,
                    subtotal=priced.subtotal,
                    tot_rate=tot.rate,
                    tot_amount=tot.tot_amount,
                    grand_total=grand_total,
                    amounts_match=not mismatches,
                    discrepancies=mismatches,
                    lines=lines,
                )
                await self._tenancy.write_audit(
                    conn,
                    action="document.intake.record",
                    detail={
                        "document_id": str(document_id),
                        "subtotal": format(priced.subtotal, "f"),
                        "tot_amount": format(tot.tot_amount, "f"),
                        "grand_total": format(grand_total, "f"),
                        "amounts_match": not mismatches,
                    },
                )

    async def _fail(
        self,
        document_id: UUID,
        user_id: UUID,
        tenant_id: UUID,
        message: str,
    ) -> None:
        pool = self._require_pool()
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await self._tenancy.bind_tenant(conn, user_id=user_id, tenant_id=tenant_id)
                    await self._repository.fail(conn, document_id, message)
                    await self._tenancy.write_audit(
                        conn,
                        action="document.intake.fail",
                        detail={"document_id": str(document_id), "error": message[:500]},
                    )
        except AllyannaError:
            return

    def _require_pool(self) -> Any:
        if self._pool is None:
            raise ServiceUnavailable("DATABASE_URL is not configured")
        return self._pool


def _validate_upload(filename: str, content_type: str | None, content: bytes) -> tuple[str, str]:
    safe_name = Path(filename or "upload").name.strip() or "upload"
    if len(safe_name) > 200:
        safe_name = safe_name[-200:]
    media = (content_type or "").split(";", 1)[0].strip().lower()
    if media not in ACCEPTED_TYPES:
        raise InvalidDocument("Upload a JPEG, PNG, WEBP, or PDF")
    if not content:
        raise InvalidDocument("The file is empty")
    if len(content) > MAX_BYTES:
        raise InvalidDocument("The file is larger than 8 MB")
    return safe_name, media
