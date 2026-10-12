"""Sum posted invoices for a period and read the turnover-tax rate from the table."""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from allyanna.errors import (
    InvalidPayment,
    InvalidWorksheet,
    TotPaymentNotFound,
    TotReturnNotFound,
    TotReturnSuperseded,
)
from allyanna.money import money, require_money
from allyanna.tax.service import TaxService
from allyanna.tenancy.service import TenancyService
from allyanna.worksheets.models import (
    TotBalanceList,
    TotFiledTax,
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
        due_on: date | None = None,
    ) -> TotReturn:
        """Store the worksheet sums and the table rate for this period."""
        worksheet = await self.build(
            conn,
            period_start=period_start,
            period_end=period_end,
            tax_year=tax_year,
            country_code=country_code,
        )
        if due_on is not None and due_on < worksheet.period_end:
            raise InvalidWorksheet("The due date is before the period end")
        filed = await self._returns.insert(conn, worksheet, due_on=due_on)
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.file",
            detail={
                "return_id": str(filed.id),
                "schedule_id": str(filed.schedule_id),
                "period_start": filed.period_start.isoformat(),
                "period_end": filed.period_end.isoformat(),
                "due_on": None if filed.due_on is None else filed.due_on.isoformat(),
                "invoice_count": filed.invoice_count,
                "subtotal": format(filed.subtotal, "f"),
                "rate": format(filed.rate, "f"),
                "tot_amount": format(filed.tot_amount, "f"),
                "grand_total": format(filed.grand_total, "f"),
            },
        )
        return filed

    async def amend_return(
        self,
        conn: Connection,
        *,
        return_id: UUID,
        due_on: date | None = None,
    ) -> TotReturn:
        """File a correction for the same period. The earlier filing stays stored."""
        current = await self.get_return(conn, return_id)
        if current.superseded:
            raise TotReturnSuperseded("This filing has been amended")
        worksheet = await self.build(
            conn,
            period_start=current.period_start,
            period_end=current.period_end,
            tax_year=current.tax_year,
            country_code=current.country_code,
        )
        chosen_due = current.due_on if due_on is None else due_on
        if chosen_due is not None and chosen_due < worksheet.period_end:
            raise InvalidWorksheet("The due date is before the period end")
        _tax_due, amount_paid, _balance_due, _payments = await self._open_statement(conn, current)
        corrected_tax = require_money(worksheet.tot_amount)
        if amount_paid > corrected_tax:
            raise InvalidPayment("The corrected tax is less than the amount already paid")
        amended = await self._returns.insert(
            conn,
            worksheet,
            due_on=chosen_due,
            amends_return_id=current.id,
        )
        tax_due, amount_paid, balance_due, _payments = await self._open_statement(conn, amended)
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.amend",
            detail={
                "return_id": str(amended.id),
                "amends_return_id": str(current.id),
                "tot_amount": format(amended.tot_amount, "f"),
                "balance": format(balance_due, "f"),
            },
        )
        return amended

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
        if filed.superseded:
            raise TotReturnSuperseded("This filing has been amended")
        payment_amount = require_money(amount)
        if payment_amount == 0:
            raise InvalidPayment("A payment must be greater than zero")
        _tax_due, _paid, remaining, _existing = await self._open_statement(conn, filed)
        if payment_amount > remaining:
            raise InvalidPayment("The payment exceeds the unpaid turnover tax")
        recorded = await self._payments.insert(
            conn,
            return_id=filed.id,
            amount=payment_amount,
            paid_on=paid_on,
        )
        tax_due, amount_paid, balance_due, _payments = await self._open_statement(conn, filed)
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

    async def list_balances(self, conn: Connection, *, as_of: date) -> TotBalanceList:
        """Tax due, amount paid, and remaining for every filing on the active profile."""
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        filed = await self._payments.list_filed_tax(conn)
        currencies = {row.currency_code for row in filed}
        if len(currencies) > 1:
            raise InvalidWorksheet("Filed returns use more than one currency")
        by_id = {row.return_id: row for row in filed}
        superseded_ids = {row.amends_return_id for row in filed if row.amends_return_id is not None}
        rows: list[TotReturnBalance] = []
        for row in filed:
            if row.return_id in superseded_ids:
                continue
            tax_due = require_money(row.tax_due)
            amount_paid = _paid_along_chain(row, by_id)
            if amount_paid > tax_due:
                raise InvalidPayment("Payments exceed the filed turnover tax")
            balance_due = money(tax_due - amount_paid)
            rows.append(
                TotReturnBalance(
                    return_id=row.return_id,
                    tenant_id=row.tenant_id,
                    country_code=row.country_code,
                    tax_year=row.tax_year,
                    period_start=row.period_start,
                    period_end=row.period_end,
                    currency_code=row.currency_code,
                    due_on=row.due_on,
                    tax_due=tax_due,
                    amount_paid=amount_paid,
                    balance_due=balance_due,
                    past_due=row.due_on is not None and row.due_on < as_of and balance_due > Decimal("0"),
                )
            )
        return TotBalanceList(
            tenant_id=tenant.id,
            as_of=as_of,
            tax_due=sum_money([row.tax_due for row in rows]),
            amount_paid=sum_money([row.amount_paid for row in rows]),
            balance_due=sum_money([row.balance_due for row in rows]),
            past_due_balance=sum_money([row.balance_due for row in rows if row.past_due]),
            returns=tuple(rows),
        )

    async def list_payments(self, conn: Connection, return_id: UUID) -> TotPaymentList:
        filed = await self.get_return(conn, return_id)
        if filed.superseded:
            tax_due, amount_paid, balance_due, payments = await self._statement(conn, filed)
        else:
            tax_due, amount_paid, balance_due, payments = await self._open_statement(conn, filed)
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
        latest = await self._latest(conn, filed)
        tax_due, amount_paid, balance_due, _payments = await self._open_statement(conn, latest)
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

    async def _latest(self, conn: Connection, filed: TotReturn) -> TotReturn:
        current = filed
        seen = {filed.id}
        while True:
            successor = await self._returns.get_successor(conn, current.id)
            if successor is None:
                return current
            if successor.id in seen:
                raise TotReturnSuperseded("This filing has been amended")
            seen.add(successor.id)
            current = successor

    async def _open_statement(
        self,
        conn: Connection,
        filed: TotReturn,
    ) -> tuple[Decimal, Decimal, Decimal, tuple[TotPayment, ...]]:
        if filed.superseded:
            raise TotReturnSuperseded("This filing has been amended")
        payments: list[TotPayment] = []
        current: TotReturn | None = filed
        seen: set[UUID] = set()
        while current is not None and current.id not in seen:
            seen.add(current.id)
            payments.extend(await self._payments.list_for_return(conn, current.id))
            if current.amends_return_id is None:
                break
            current = await self._returns.get_return(conn, current.amends_return_id)
        ordered = tuple(sorted(payments, key=lambda item: (item.paid_on, item.recorded_at, str(item.id))))
        tax_due = require_money(filed.tot_amount)
        amount_paid = sum_money([row.amount for row in ordered])
        if amount_paid > tax_due:
            raise InvalidPayment("Payments exceed the filed turnover tax")
        balance_due = money(tax_due - amount_paid)
        return tax_due, amount_paid, balance_due, ordered


def _paid_along_chain(latest: TotFiledTax, by_id: dict[UUID, TotFiledTax]) -> Decimal:
    total = Decimal("0")
    seen: set[UUID] = set()
    current: TotFiledTax | None = latest
    while current is not None and current.return_id not in seen:
        seen.add(current.return_id)
        total = money(total + require_money(current.amount_paid))
        parent_id = current.amends_return_id
        current = None if parent_id is None else by_id.get(parent_id)
    return money(total)
