"""Sum posted invoices for a period and read the turnover-tax rate from the table."""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from allyanna.errors import InvalidPayment, InvalidWorksheet, TotPaymentNotFound, TotReturnNotFound
from allyanna.money import money, require_money
from allyanna.tax.service import TaxService
from allyanna.tenancy.service import TenancyService
from allyanna.worksheets.models import (
    TotBalanceList,
    TotPayment,
    TotPaymentList,
    TotPaymentView,
    TotReturn,
    TotReturnBalance,
    TotWorksheet,
)
from allyanna.worksheets.payments import TotPaymentRepository
from allyanna.worksheets.repository import WorksheetRepository
from allyanna.worksheets.returns import TotReturnRepository
from allyanna.worksheets.sum import sum_money

Connection = Any


class TotWorksheetService:
    def __init__(
        self,
        repository: WorksheetRepository,
        tax: TaxService,
        tenancy: TenancyService,
        returns: TotReturnRepository,
        payments: TotPaymentRepository,
    ) -> None:
        self._repository = repository
        self._tax = tax
        self._tenancy = tenancy
        self._returns = returns
        self._payments = payments

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

    async def file_return(
        self,
        conn: Connection,
        *,
        period_start: date,
        period_end: date,
        tax_year: int,
        country_code: str,
    ) -> TotReturn:
        """Store the worksheet sums and the table rate for this period."""
        worksheet = await self.build(
            conn,
            period_start=period_start,
            period_end=period_end,
            tax_year=tax_year,
            country_code=country_code,
        )
        filed = await self._returns.insert(conn, worksheet)
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.file",
            detail={
                "return_id": str(filed.id),
                "schedule_id": str(filed.schedule_id),
                "period_start": filed.period_start.isoformat(),
                "period_end": filed.period_end.isoformat(),
                "invoice_count": filed.invoice_count,
                "subtotal": format(filed.subtotal, "f"),
                "rate": format(filed.rate, "f"),
                "tot_amount": format(filed.tot_amount, "f"),
                "grand_total": format(filed.grand_total, "f"),
            },
        )
        return filed

    async def list_returns(self, conn: Connection) -> tuple[UUID, tuple[TotReturn, ...]]:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        return tenant.id, await self._returns.list_returns(conn)

    async def get_return(self, conn: Connection, return_id: UUID) -> TotReturn:
        await self._tenancy.require_active_tenant(conn)
        found = await self._returns.get_return(conn, return_id)
        if found is None:
            raise TotReturnNotFound("Turnover-tax return was not found for the active business")
        return found

    async def record_payment(
        self,
        conn: Connection,
        *,
        return_id: UUID,
        amount: Decimal,
        paid_on: date,
    ) -> TotPaymentView:
        """Apply a payment to the filed turnover tax. The amount is not a rate."""
        filed = await self.get_return(conn, return_id)
        payment_amount = require_money(amount)
        if payment_amount == 0:
            raise InvalidPayment("A payment must be greater than zero")
        _tax_due, _paid, remaining, _existing = await self._statement(conn, filed)
        if payment_amount > remaining:
            raise InvalidPayment("The payment exceeds the unpaid turnover tax")
        recorded = await self._payments.insert(
            conn,
            return_id=filed.id,
            amount=payment_amount,
            paid_on=paid_on,
        )
        tax_due, amount_paid, balance_due, _payments = await self._statement(conn, filed)
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.pay",
            detail={
                "return_id": str(filed.id),
                "payment_id": str(recorded.id),
                "amount": format(recorded.amount, "f"),
                "balance": format(balance_due, "f"),
            },
        )
        return TotPaymentView(
            payment=recorded,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
        )

    async def list_balances(self, conn: Connection) -> TotBalanceList:
        """Tax due, amount paid, and remaining for every filing on the active profile."""
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        filed = await self._payments.list_filed_tax(conn)
        currencies = {row.currency_code for row in filed}
        if len(currencies) > 1:
            raise InvalidWorksheet("Filed returns use more than one currency")
        rows: list[TotReturnBalance] = []
        for row in filed:
            tax_due = require_money(row.tax_due)
            amount_paid = require_money(row.amount_paid)
            if amount_paid > tax_due:
                raise InvalidPayment("Payments exceed the filed turnover tax")
            rows.append(
                TotReturnBalance(
                    return_id=row.return_id,
                    tenant_id=row.tenant_id,
                    country_code=row.country_code,
                    tax_year=row.tax_year,
                    period_start=row.period_start,
                    period_end=row.period_end,
                    currency_code=row.currency_code,
                    tax_due=tax_due,
                    amount_paid=amount_paid,
                    balance_due=money(tax_due - amount_paid),
                )
            )
        return TotBalanceList(
            tenant_id=tenant.id,
            tax_due=sum_money([row.tax_due for row in rows]),
            amount_paid=sum_money([row.amount_paid for row in rows]),
            balance_due=sum_money([row.balance_due for row in rows]),
            returns=tuple(rows),
        )

    async def list_payments(self, conn: Connection, return_id: UUID) -> TotPaymentList:
        filed = await self.get_return(conn, return_id)
        tax_due, amount_paid, balance_due, payments = await self._statement(conn, filed)
        return TotPaymentList(
            tenant_id=filed.tenant_id,
            tot_return_id=filed.id,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
            payments=payments,
        )

    async def get_payment(self, conn: Connection, payment_id: UUID) -> TotPaymentView:
        await self._tenancy.require_active_tenant(conn)
        found = await self._payments.get_payment(conn, payment_id)
        if found is None:
            raise TotPaymentNotFound("Turnover-tax payment was not found for the active business")
        filed = await self._returns.get_return(conn, found.tot_return_id)
        if filed is None:
            raise TotReturnNotFound("Turnover-tax return was not found for the active business")
        tax_due, amount_paid, balance_due, _payments = await self._statement(conn, filed)
        return TotPaymentView(
            payment=found,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
        )

    async def _statement(
        self,
        conn: Connection,
        filed: TotReturn,
    ) -> tuple[Decimal, Decimal, Decimal, tuple[TotPayment, ...]]:
        payments = await self._payments.list_for_return(conn, filed.id)
        tax_due = require_money(filed.tot_amount)
        amount_paid = sum_money([row.amount for row in payments])
        if amount_paid > tax_due:
            raise InvalidPayment("Payments exceed the filed turnover tax")
        balance_due = money(tax_due - amount_paid)
        return tax_due, amount_paid, balance_due, payments
