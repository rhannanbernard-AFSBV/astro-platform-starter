"""Compose OCR review and turnover-tax period readiness for the active profile.

Turnover tax stays invoice-based. Payroll and wage rows are not read here.
"""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from allyanna.invoices.service import InvoiceService
from allyanna.money import require_money
from allyanna.readiness.models import (
    IntakeReview,
    IntakeReviewList,
    TotPeriodReadiness,
    UnfiledInvoice,
)
from allyanna.tenancy.service import TenancyService
from allyanna.worksheets.models import TotDueOpenReturn
from allyanna.worksheets.service import TotWorksheetService
from allyanna.worksheets.sum import sum_money

Connection = Any


class TotPeriodReadinessService:
    def __init__(
        self,
        invoices: InvoiceService,
        worksheets: TotWorksheetService,
        tenancy: TenancyService,
    ) -> None:
        self._invoices = invoices
        self._worksheets = worksheets
        self._tenancy = tenancy

    async def list_intake_reviews(self, conn: Connection) -> IntakeReviewList:
        """Review every intake on the active business for post readiness."""
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        documents = await self._invoices.documents.list_documents(conn)
        reviews = [await self._review_one(conn, document.id) for document in documents]
        return IntakeReviewList(
            tenant_id=tenant.id,
            ready_count=sum(1 for row in reviews if row.ready_to_post),
            blocked_count=sum(1 for row in reviews if not row.ready_to_post),
            reviews=tuple(reviews),
        )

    async def get_intake_review(self, conn: Connection, document_id: UUID) -> IntakeReview:
        await self._tenancy.require_active_tenant(conn)
        return await self._review_one(conn, document_id)

    async def get_period_readiness(
        self,
        conn: Connection,
        *,
        tax_year: int,
        country_code: str,
        as_of: date | None = None,
    ) -> TotPeriodReadiness:
        """Show what still needs posting, filing, or paying for the tax year."""
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        day = date.today() if as_of is None else as_of
        listing = await self.list_intake_reviews(conn)
        year_reviews = [
            row
            for row in listing.reviews
            if row.tax_year == tax_year and row.country_code == country_code
        ]
        ready = tuple(row for row in year_reviews if row.ready_to_post)
        blocked = tuple(row for row in year_reviews if not row.ready_to_post)

        invoices = await self._invoices.list_invoices(conn)
        unfiled: list[UnfiledInvoice] = []
        for invoice in invoices:
            if invoice.tax_year != tax_year or invoice.country_code != country_code:
                continue
            if await self._invoices.period_is_filed(
                conn,
                invoice_date=invoice.invoice_date,
                country_code=invoice.country_code,
            ):
                continue
            unfiled.append(
                UnfiledInvoice(
                    invoice_id=invoice.id,
                    vendor_name=invoice.vendor_name,
                    invoice_date=invoice.invoice_date,
                    tax_year=invoice.tax_year,
                    country_code=invoice.country_code,
                    currency_code=invoice.currency_code,
                    subtotal=require_money(invoice.subtotal),
                    tot_rate=invoice.tot_rate,
                    tot_amount=require_money(invoice.tot_amount),
                    grand_total=require_money(invoice.grand_total),
                    document_intake_id=invoice.document_intake_id,
                )
            )
        unfiled.sort(key=lambda row: (row.invoice_date, str(row.invoice_id)))

        balances = await self._worksheets.list_balances(conn, as_of=day)
        open_returns = tuple(
            TotDueOpenReturn(
                return_id=row.return_id,
                period_start=row.period_start,
                period_end=row.period_end,
                currency_code=row.currency_code,
                due_on=row.due_on,
                tax_due=require_money(row.tax_due),
                amount_paid=require_money(row.amount_paid),
                balance_due=require_money(row.balance_due),
                past_due=row.past_due,
                payment_path=f"/api/v1/tax/tot/returns/{row.return_id}/payments",
            )
            for row in balances.returns
            if row.tax_year == tax_year
            and row.country_code == country_code
            and row.balance_due > Decimal("0")
        )

        dues_list = await self._worksheets.list_annual_summary_dues(conn, as_of=day)
        dues = next(
            (
                row
                for row in dues_list.dues
                if row.tax_year == tax_year and row.country_code == country_code
            ),
            None,
        )

        return TotPeriodReadiness(
            tenant_id=tenant.id,
            tax_year=tax_year,
            country_code=country_code,
            ready_count=len(ready),
            blocked_count=len(blocked),
            unfiled_invoice_count=len(unfiled),
            open_return_count=len(open_returns),
            unfiled_tot_amount=sum_money([row.tot_amount for row in unfiled]),
            open_balance=sum_money([row.balance_due for row in open_returns]),
            intakes_ready=ready,
            intakes_blocked=blocked,
            unfiled_invoices=tuple(unfiled),
            open_returns=open_returns,
            dues=dues,
        )

    async def _review_one(self, conn: Connection, document_id: UUID) -> IntakeReview:
        document = await self._invoices.documents.get_document(conn, document_id)
        invoice_id = await self._invoices.find_posted_intake_id(conn, document.id)
        blocked_reason: str | None = None
        ready = False
        post_path: str | None = None

        if document.status == "failed":
            blocked_reason = "failed"
        elif document.status != "completed":
            blocked_reason = "not_completed"
        elif invoice_id is not None:
            blocked_reason = "already_posted"
        elif document.amounts_match is not True:
            blocked_reason = "amount_mismatch"
        elif (
            document.vendor_name is None
            or document.invoice_date is None
            or document.subtotal is None
            or document.tot_amount is None
            or document.grand_total is None
            or document.country_code is None
            or not document.lines
        ):
            blocked_reason = "incomplete"
        elif await self._invoices.period_is_filed(
            conn,
            invoice_date=document.invoice_date,
            country_code=document.country_code,
        ):
            blocked_reason = "filed_period"
        else:
            ready = True
            post_path = f"/api/v1/documents/{document.id}/invoice"

        return IntakeReview(
            document_id=document.id,
            tenant_id=document.tenant_id,
            status=document.status,
            source_filename=document.source_filename,
            vendor_name=document.vendor_name,
            invoice_date=document.invoice_date,
            tax_year=document.tax_year,
            country_code=document.country_code,
            extracted_tot_amount=document.extracted_tot_amount,
            table_tot_amount=document.tot_amount,
            tot_rate=document.tot_rate,
            subtotal=document.subtotal,
            grand_total=document.grand_total,
            amounts_match=document.amounts_match,
            discrepancies=document.discrepancies,
            ready_to_post=ready,
            blocked_reason=blocked_reason,
            post_path=post_path,
            invoice_id=invoice_id,
        )
