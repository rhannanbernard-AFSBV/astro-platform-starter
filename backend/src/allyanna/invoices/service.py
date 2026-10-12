"""Record an invoice for the active business profile.

Subtotal is the sum of line totals. Turnover tax is the existing TOT
calculation against that subtotal, using the rate loaded for the tax year.
"""

from datetime import date
from typing import Any
from uuid import UUID

from allyanna.errors import InvalidInvoice, InvoiceNotFound
from allyanna.invoices.models import Invoice, InvoiceLineInput
from allyanna.invoices.repository import InvoiceRepository
from allyanna.invoices.totals import price_lines
from allyanna.money import money
from allyanna.tax.service import TaxService
from allyanna.tenancy.service import TenancyService

Connection = Any


class InvoiceService:
    def __init__(
        self,
        repository: InvoiceRepository,
        tax: TaxService,
        tenancy: TenancyService,
    ) -> None:
        self._repository = repository
        self._tax = tax
        self._tenancy = tenancy

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
            },
        )
        return invoice

    async def list_invoices(self, conn: Connection) -> tuple[Invoice, ...]:
        await self._tenancy.require_active_tenant(conn)
        return await self._repository.list_invoices(conn)

    async def get_invoice(self, conn: Connection, invoice_id: UUID) -> Invoice:
        await self._tenancy.require_active_tenant(conn)
        invoice = await self._repository.get_invoice(conn, invoice_id)
        if invoice is None:
            raise InvoiceNotFound("Invoice was not found for the active business profile")
        return invoice
