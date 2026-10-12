"""Sum posted invoices for a period and read the turnover-tax rate from the table."""

from datetime import date
from typing import Any

from allyanna.errors import InvalidWorksheet
from allyanna.money import money
from allyanna.tax.service import TaxService
from allyanna.tenancy.service import TenancyService
from allyanna.worksheets.models import TotWorksheet
from allyanna.worksheets.repository import WorksheetRepository
from allyanna.worksheets.sum import sum_money

Connection = Any


class TotWorksheetService:
    def __init__(
        self,
        repository: WorksheetRepository,
        tax: TaxService,
        tenancy: TenancyService,
    ) -> None:
        self._repository = repository
        self._tax = tax
        self._tenancy = tenancy

    async def build(
        self,
        conn: Connection,
        *,
        period_start: date,
        period_end: date,
        tax_year: int,
        country_code: str,
    ) -> TotWorksheet:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        if period_end < period_start:
            raise InvalidWorksheet("The period end is before the period start")
        if period_start.year != tax_year or period_end.year != tax_year:
            raise InvalidWorksheet("The period must fall in the tax year")
        posted = await self._repository.list_posted_invoices(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            period_start=period_start,
            period_end=period_end,
        )
        subtotal = sum_money([row.subtotal for row in posted])
        tot_amount = sum_money([row.tot_amount for row in posted])
        grand_total = money(subtotal + tot_amount)
        posted_grand = sum_money([row.grand_total for row in posted])
        if posted_grand != grand_total:
            raise InvalidWorksheet("Posted invoice totals do not reconcile")
        _same_tenant, bundle, priced = await self._tax.calculate_tot(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            gross_taxable_revenue=subtotal,
        )
        worksheet = TotWorksheet(
            tenant_id=tenant.id,
            period_start=period_start,
            period_end=period_end,
            tax_year=bundle.schedule.tax_year,
            country_code=bundle.schedule.country_code,
            currency_code=bundle.schedule.currency_code,
            schedule_id=bundle.schedule.id,
            rate=priced.rate,
            invoice_count=len(posted),
            subtotal=subtotal,
            tot_amount=tot_amount,
            grand_total=grand_total,
            invoices=posted,
        )
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.worksheet",
            detail={
                "tenant_id": str(worksheet.tenant_id),
                "schedule_id": str(worksheet.schedule_id),
                "period_start": period_start.isoformat(),
                "period_end": period_end.isoformat(),
                "invoice_count": worksheet.invoice_count,
                "subtotal": format(worksheet.subtotal, "f"),
                "rate": format(worksheet.rate, "f"),
                "tot_amount": format(worksheet.tot_amount, "f"),
                "grand_total": format(worksheet.grand_total, "f"),
            },
        )
        return worksheet
