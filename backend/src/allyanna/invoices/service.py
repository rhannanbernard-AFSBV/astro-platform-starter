"""Record an invoice for the active business profile.

Subtotal is the sum of line totals. Turnover tax is the existing TOT
calculation against that subtotal, using the rate loaded for the tax year.
"""

from datetime import date
from typing import Any
from uuid import UUID

from allyanna.errors import (
    CorrectingInvoiceExists,
    IntakeAlreadyPosted,
    InvalidDocument,
    InvalidInvoice,
    InvoiceNotFound,
    InvoicePeriodFiled,
    TotReturnNotFound,
    TotReturnSuperseded,
)
from allyanna.invoices.models import Invoice, InvoiceLineInput
from allyanna.invoices.repository import InvoiceRepository
from allyanna.invoices.totals import price_lines
from allyanna.money import money
from allyanna.ocr.service import DocumentIntakeService
from allyanna.tax.service import TaxService
from allyanna.tenancy.service import TenancyService

Connection = Any


class InvoiceService:
    def __init__(
        self,
        repository: InvoiceRepository,
        tax: TaxService,
        tenancy: TenancyService,
        documents: DocumentIntakeService,
    ) -> None:
        self._repository = repository
        self._tax = tax
        self._tenancy = tenancy
        self._documents = documents

    async def create_invoice(
        self,
        conn: Connection,
        *,
        vendor_name: str,
        invoice_number: str | None,
        invoice_date: date,
        due_date: date | None,
        tax_year: int,
        country_code: str,
        lines: list[InvoiceLineInput],
        corrects_return_id: UUID | None = None,
    ) -> Invoice:
        vendor = vendor_name.strip()
        if not vendor:
            raise InvalidInvoice("vendor name is required")
        if invoice_date.year != tax_year:
            raise InvalidInvoice("tax_year must be the year of the invoice date")
        if due_date is not None and due_date < invoice_date:
            raise InvalidInvoice("due date cannot be earlier than the invoice date")
        priced, subtotal = price_lines(lines)
        _tenant, bundle, tot = await self._tax.calculate_tot(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            gross_taxable_revenue=subtotal,
        )
        grand_total = money(subtotal + tot.tot_amount)
        if corrects_return_id is None:
            await self._ensure_period_open(conn, invoice_date=invoice_date, country_code=country_code)
        else:
            await self._ensure_correcting_invoice(
                conn,
                corrects_return_id=corrects_return_id,
                invoice_date=invoice_date,
                tax_year=tax_year,
                country_code=country_code,
            )
        invoice = await self._repository.insert_invoice(
            conn,
            vendor_name=vendor,
            invoice_number=invoice_number,
            invoice_date=invoice_date,
            due_date=due_date,
            currency_code=bundle.schedule.currency_code,
            tax_year=tax_year,
            country_code=country_code,
            tax_schedule_id=bundle.schedule.id,
            subtotal=subtotal,
            tot_rate=tot.rate,
            tot_amount=tot.tot_amount,
            grand_total=grand_total,
            lines=priced,
            corrects_return_id=corrects_return_id,
        )
        await self._tenancy.write_audit(
            conn,
            action="invoice.record",
            detail={
                "invoice_id": str(invoice.id),
                "tax_schedule_id": str(bundle.schedule.id),
                "subtotal": format(invoice.subtotal, "f"),
                "tot_rate": format(invoice.tot_rate, "f"),
                "tot_amount": format(invoice.tot_amount, "f"),
                "grand_total": format(invoice.grand_total, "f"),
                "corrects_return_id": None if invoice.corrects_return_id is None else str(invoice.corrects_return_id),
            },
        )
        return invoice

    async def post_intake(self, conn: Connection, document_id: UUID) -> Invoice:
        """Post the intake's recomputed vendor, date, subtotal, tax, and total.

        Line amounts are priced again with Decimal. Turnover tax is the tax
        service result for that subtotal. Printed model amounts are not read.
        """
        document = await self._documents.get_document(conn, document_id)
        if document.status != "completed":
            raise InvalidDocument("Only a completed intake can be posted")
        vendor = document.vendor_name
        invoice_date = document.invoice_date
        reviewed_subtotal = document.subtotal
        reviewed_tot = document.tot_amount
        reviewed_grand = document.grand_total
        country_code = document.country_code
        if (
            vendor is None
            or invoice_date is None
            or reviewed_subtotal is None
            or reviewed_tot is None
            or reviewed_grand is None
            or country_code is None
            or not document.lines
        ):
            raise InvalidDocument("The completed intake is missing recomputed amounts")
        if document.tax_year is not None and document.tax_year != invoice_date.year:
            raise InvalidDocument("The intake tax year does not match the invoice date")
        priced, subtotal = price_lines(
            [
                InvoiceLineInput(
                    description=line.description,
                    quantity=line.quantity,
                    unit_price=line.unit_price,
                )
                for line in document.lines
            ]
        )
        if subtotal != reviewed_subtotal:
            raise InvalidDocument("The recomputed subtotal does not match the priced lines")
        for stored, priced_line in zip(document.lines, priced, strict=True):
            if priced_line.line_total != stored.line_total:
                raise InvalidDocument("A recomputed line total does not match the priced line")
        _tenant, bundle, tot = await self._tax.calculate_tot(
            conn,
            country_code=country_code,
            tax_year=invoice_date.year,
            gross_taxable_revenue=subtotal,
        )
        grand_total = money(subtotal + tot.tot_amount)
        if tot.tot_amount != reviewed_tot or grand_total != reviewed_grand:
            raise InvalidDocument("The recomputed turnover tax does not match the tax table")
        if await self._repository.find_posted_intake(conn, document.id) is not None:
            raise IntakeAlreadyPosted("This intake is already posted to the ledger")
        await self._ensure_period_open(conn, invoice_date=invoice_date, country_code=country_code)
        invoice = await self._repository.insert_invoice(
            conn,
            vendor_name=vendor,
            invoice_number=None,
            invoice_date=invoice_date,
            due_date=None,
            currency_code=bundle.schedule.currency_code,
            tax_year=invoice_date.year,
            country_code=country_code,
            tax_schedule_id=bundle.schedule.id,
            subtotal=subtotal,
            tot_rate=tot.rate,
            tot_amount=tot.tot_amount,
            grand_total=grand_total,
            lines=priced,
            document_intake_id=document.id,
        )
        await self._tenancy.write_audit(
            conn,
            action="invoice.post_intake",
            detail={
                "invoice_id": str(invoice.id),
                "document_id": str(document.id),
                "tax_schedule_id": str(bundle.schedule.id),
                "subtotal": format(invoice.subtotal, "f"),
                "tot_rate": format(invoice.tot_rate, "f"),
                "tot_amount": format(invoice.tot_amount, "f"),
                "grand_total": format(invoice.grand_total, "f"),
            },
        )
        return invoice

    async def _ensure_period_open(
        self,
        conn: Connection,
        *,
        invoice_date: date,
        country_code: str,
    ) -> None:
        if await self._repository.filed_period_covers(conn, invoice_date, country_code):
            raise InvoicePeriodFiled("This invoice date falls in a period that is already filed")

    async def _ensure_correcting_invoice(
        self,
        conn: Connection,
        *,
        corrects_return_id: UUID,
        invoice_date: date,
        tax_year: int,
        country_code: str,
    ) -> None:
        filing = await self._repository.get_filed_return(conn, corrects_return_id)
        if filing is None:
            raise TotReturnNotFound("Turnover-tax return was not found for the active business")
        if filing.superseded:
            raise TotReturnSuperseded("This filing has been amended")
        if filing.country_code != country_code or filing.tax_year != tax_year:
            raise InvalidInvoice("The correcting invoice does not match the filed return")
        if invoice_date < filing.period_start or invoice_date > filing.period_end:
            raise InvalidInvoice("The invoice date is outside the filed period")
        if await self._repository.correction_exists(conn, corrects_return_id):
            raise CorrectingInvoiceExists("This filing already has a correcting invoice")

    @property
    def documents(self) -> DocumentIntakeService:
        return self._documents

    async def find_posted_intake_id(self, conn: Connection, document_id: UUID) -> UUID | None:
        await self._tenancy.require_active_tenant(conn)
        return await self._repository.find_posted_intake(conn, document_id)

    async def period_is_filed(
        self,
        conn: Connection,
        *,
        invoice_date: date,
        country_code: str,
    ) -> bool:
        await self._tenancy.require_active_tenant(conn)
        return await self._repository.filed_period_covers(conn, invoice_date, country_code)

    async def list_invoices(self, conn: Connection) -> tuple[Invoice, ...]:
        await self._tenancy.require_active_tenant(conn)
        return await self._repository.list_invoices(conn)

    async def get_invoice(self, conn: Connection, invoice_id: UUID) -> Invoice:
        await self._tenancy.require_active_tenant(conn)
        invoice = await self._repository.get_invoice(conn, invoice_id)
        if invoice is None:
            raise InvoiceNotFound("Invoice was not found for the active business profile")
        return invoice
