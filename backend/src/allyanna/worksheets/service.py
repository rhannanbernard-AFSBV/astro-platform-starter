"""Sum posted invoices for a period and read the turnover-tax rate from the table.

Turnover tax due to the Sint Maarten Tax Office is the tax-table rate on the
active profile's posted invoice subtotals. Wage tax and SZV are separate. This
service does not read employee wage runs or wage-tax rows.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from allyanna.errors import (
    InvalidPayment,
    InvalidWorksheet,
    TotPaymentNotFound,
    TotAnnualSummaryNotFound,
    TotAnnualSummarySuperseded,
    TotRefundNotFound,
    TotReturnNotFound,
    TotReturnSuperseded,
)
from allyanna.money import money, require_money
from allyanna.tax.service import TaxService
from allyanna.tenancy.service import TenancyService
from allyanna.worksheets.models import (
    TotAnnualSummary,
    TotAnnualSummaryDue,
    TotAnnualSummaryDueActions,
    TotAnnualSummaryDueList,
    TotAnnualSummaryGap,
    TotAnnualSummaryList,
    TotAnnualSummaryStatement,
    TotAnnualSummaryVersion,
    TotBalanceList,
    TotDueOpenReturn,
    TotFiledTax,
    TotPayment,
    TotPaymentList,
    TotPaymentView,
    TotRefund,
    TotRefundList,
    TotRefundView,
    TotReturn,
    TotStatement,
    TotStatementLine,
    TotYearFiling,
    TotYearStatement,
    TotReturnBalance,
    TotWorksheet,
)
from allyanna.worksheets.payments import TotPaymentRepository
from allyanna.worksheets.refunds import TotRefundRepository
from allyanna.worksheets.summaries import TotAnnualSummaryRepository
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
        refunds: TotRefundRepository,
        summaries: TotAnnualSummaryRepository,
    ) -> None:
        self._repository = repository
        self._tax = tax
        self._tenancy = tenancy
        self._returns = returns
        self._payments = payments
        self._refunds = refunds
        self._summaries = summaries

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
        _tax_due, amount_paid, _balance_due, _payments, _refunds = await self._open_statement(conn, current)
        corrected_tax = require_money(worksheet.tot_amount)
        if amount_paid > corrected_tax:
            raise InvalidPayment("The corrected tax is less than the amount already paid")
        amended = await self._returns.insert(
            conn,
            worksheet,
            due_on=chosen_due,
            amends_return_id=current.id,
        )
        tax_due, amount_paid, balance_due, _payments, _refunds = await self._open_statement(conn, amended)
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
        _tax_due, _paid, remaining, _existing, _refunds = await self._open_statement(conn, filed)
        if payment_amount > remaining:
            raise InvalidPayment("The payment exceeds the unpaid turnover tax")
        recorded = await self._payments.insert(
            conn,
            return_id=filed.id,
            amount=payment_amount,
            paid_on=paid_on,
        )
        tax_due, amount_paid, balance_due, _payments, _refunds = await self._open_statement(conn, filed)
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

    async def record_refund(
        self,
        conn: Connection,
        *,
        return_id: UUID,
        amount: Decimal,
        refunded_on: date,
    ) -> TotRefundView:
        """Reduce the amount paid on the latest filing. The payment row stays."""
        filed = await self.get_return(conn, return_id)
        if filed.superseded:
            raise TotReturnSuperseded("This filing has been amended")
        refund_amount = require_money(amount)
        if refund_amount == 0:
            raise InvalidPayment("A refund must be greater than zero")
        _tax_due, amount_paid, _balance, _payments, _existing = await self._open_statement(conn, filed)
        if refund_amount > amount_paid:
            raise InvalidPayment("The refund exceeds the amount paid")
        recorded = await self._refunds.insert(
            conn,
            return_id=filed.id,
            amount=refund_amount,
            refunded_on=refunded_on,
        )
        tax_due, amount_paid, balance_due, _payments, _refunds = await self._open_statement(conn, filed)
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.refund",
            detail={
                "return_id": str(filed.id),
                "refund_id": str(recorded.id),
                "amount": format(recorded.amount, "f"),
                "amount_paid": format(amount_paid, "f"),
                "balance": format(balance_due, "f"),
            },
        )
        return TotRefundView(
            refund=recorded,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
        )

    async def list_payments(self, conn: Connection, return_id: UUID) -> TotPaymentList:
        filed = await self.get_return(conn, return_id)
        if filed.superseded:
            tax_due, amount_paid, balance_due, payments, _refunds = await self._statement(conn, filed)
        else:
            tax_due, amount_paid, balance_due, payments, _refunds = await self._open_statement(conn, filed)
        return TotPaymentList(
            tenant_id=filed.tenant_id,
            tot_return_id=filed.id,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
            payments=payments,
        )

    async def list_refunds(self, conn: Connection, return_id: UUID) -> TotRefundList:
        filed = await self.get_return(conn, return_id)
        if filed.superseded:
            tax_due, amount_paid, balance_due, _payments, refunds = await self._statement(conn, filed)
        else:
            tax_due, amount_paid, balance_due, _payments, refunds = await self._open_statement(conn, filed)
        return TotRefundList(
            tenant_id=filed.tenant_id,
            tot_return_id=filed.id,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
            refunds=refunds,
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
        tax_due, amount_paid, balance_due, _payments, _refunds = await self._open_statement(conn, latest)
        return TotPaymentView(
            payment=found,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
        )

    async def get_statement(self, conn: Connection, return_id: UUID) -> TotStatement:
        """List the latest filing's payments and refunds with a running balance.

        Both rows stay stored. The balance is the tax still due after each one.
        """
        filed = await self.get_return(conn, return_id)
        if filed.superseded:
            raise TotReturnSuperseded("This filing has been amended")
        tax_due, amount_paid, balance_due, payments, refunds = await self._open_statement(conn, filed)
        lines = _running_lines(tax_due, payments, refunds)
        if lines:
            if lines[-1].balance != balance_due:
                raise InvalidPayment("The statement balance does not match the amount paid")
        elif balance_due != tax_due:
            raise InvalidPayment("The statement balance does not match the amount paid")
        return TotStatement(
            tenant_id=filed.tenant_id,
            tot_return_id=filed.id,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
            lines=lines,
        )

    async def get_year_statement(
        self,
        conn: Connection,
        *,
        tax_year: int,
        country_code: str,
    ) -> TotYearStatement:
        """Latest filings for one tax year, with a balance that carries forward.

        Superseded filings are omitted. Each latest filing keeps its payments
        and refunds. The running balance starts at zero and continues across
        the year.
        """
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        filed = await self._payments.list_filed_tax(conn)
        superseded_ids = {row.amends_return_id for row in filed if row.amends_return_id is not None}
        chosen = [
            row
            for row in filed
            if row.tax_year == tax_year
            and row.country_code == country_code
            and row.return_id not in superseded_ids
        ]
        chosen.sort(key=lambda row: (row.period_start, row.period_end, str(row.return_id)))
        currencies = {row.currency_code for row in chosen}
        if len(currencies) > 1:
            raise InvalidWorksheet("Filed returns use more than one currency")
        opening = Decimal("0")
        filings: list[TotYearFiling] = []
        for row in chosen:
            current = await self.get_return(conn, row.return_id)
            tax_due, amount_paid, balance_due, payments, refunds = await self._open_statement(conn, current)
            start = money(opening + tax_due)
            lines = _running_lines(tax_due, payments, refunds, starting_balance=start)
            closing = lines[-1].balance if lines else start
            if closing != money(opening + balance_due):
                raise InvalidPayment("The statement balance does not match the amount paid")
            filings.append(
                TotYearFiling(
                    return_id=current.id,
                    period_start=current.period_start,
                    period_end=current.period_end,
                    tax_due=tax_due,
                    amount_paid=amount_paid,
                    balance_due=balance_due,
                    opening_balance=money(opening),
                    closing_balance=closing,
                    lines=lines,
                )
            )
            opening = closing
        return TotYearStatement(
            tenant_id=tenant.id,
            tax_year=tax_year,
            country_code=country_code,
            currency_code=None if not currencies else next(iter(currencies)),
            tax_due=sum_money([item.tax_due for item in filings]),
            amount_paid=sum_money([item.amount_paid for item in filings]),
            balance_due=money(opening),
            filings=tuple(filings),
        )

    async def _year_snapshot(
        self,
        conn: Connection,
        *,
        tax_year: int,
        country_code: str,
    ) -> tuple[TotYearStatement, Decimal, Decimal, Decimal]:
        statement = await self.get_year_statement(conn, tax_year=tax_year, country_code=country_code)
        if not statement.filings or statement.currency_code is None:
            raise InvalidWorksheet("There is no filing to summarize for this tax year")
        tax_due = require_money(statement.tax_due)
        amount_paid = require_money(statement.amount_paid)
        balance_due = require_money(statement.balance_due)
        if balance_due != money(tax_due - amount_paid):
            raise InvalidPayment("The annual summary balance does not match the stored tax")
        return statement, tax_due, amount_paid, balance_due

    async def file_annual_summary(
        self,
        conn: Connection,
        *,
        tax_year: int,
        country_code: str,
    ) -> TotAnnualSummary:
        """Freeze the year statement. The period filings stay stored."""
        statement, tax_due, amount_paid, balance_due = await self._year_snapshot(
            conn,
            tax_year=tax_year,
            country_code=country_code,
        )
        recorded = await self._summaries.insert(
            conn,
            country_code=statement.country_code,
            tax_year=statement.tax_year,
            currency_code=statement.currency_code,
            filing_count=len(statement.filings),
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
        )
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.summarize",
            detail={
                "summary_id": str(recorded.id),
                "tax_year": recorded.tax_year,
                "filing_count": recorded.filing_count,
                "tax_due": format(recorded.tax_due, "f"),
                "amount_paid": format(recorded.amount_paid, "f"),
                "balance_due": format(recorded.balance_due, "f"),
            },
        )
        return recorded

    async def amend_annual_summary(self, conn: Connection, summary_id: UUID) -> TotAnnualSummary:
        """Store the year totals after later payments. The earlier summary stays stored."""
        current = await self.get_annual_summary(conn, summary_id)
        if current.superseded:
            raise TotAnnualSummarySuperseded("This annual summary has been amended")
        statement, tax_due, amount_paid, balance_due = await self._year_snapshot(
            conn,
            tax_year=current.tax_year,
            country_code=current.country_code,
        )
        if statement.currency_code != current.currency_code:
            raise InvalidWorksheet("The year statement currency does not match the summary")
        recorded = await self._summaries.insert(
            conn,
            country_code=statement.country_code,
            tax_year=statement.tax_year,
            currency_code=statement.currency_code,
            filing_count=len(statement.filings),
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
            amends_summary_id=current.id,
        )
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.summarize.amend",
            detail={
                "summary_id": str(recorded.id),
                "amends_summary_id": str(current.id),
                "tax_year": recorded.tax_year,
                "filing_count": recorded.filing_count,
                "tax_due": format(recorded.tax_due, "f"),
                "amount_paid": format(recorded.amount_paid, "f"),
                "balance_due": format(recorded.balance_due, "f"),
            },
        )
        return recorded

    async def list_annual_summaries(self, conn: Connection) -> TotAnnualSummaryList:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        return TotAnnualSummaryList(
            tenant_id=tenant.id,
            summaries=await self._summaries.list_summaries(conn),
        )

    async def get_annual_summary(self, conn: Connection, summary_id: UUID) -> TotAnnualSummary:
        await self._tenancy.require_active_tenant(conn)
        found = await self._summaries.get_summary(conn, summary_id)
        if found is None:
            raise TotAnnualSummaryNotFound("Annual summary was not found for the active business")
        return found

    async def get_annual_summary_statement(
        self,
        conn: Connection,
        summary_id: UUID,
    ) -> TotAnnualSummaryStatement:
        """List each stored version, its change, and the unfiled live gap.

        The earlier rows stay as they were filed. Version changes are differences
        of those stored amounts. A later payment on a filed return appears under
        unfiled until another amendment copies the live year statement.
        """
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        summaries = await self._summaries.list_summaries(conn)
        ordered = _summary_chain(summaries, summary_id)
        previous_tax = Decimal("0")
        previous_paid = Decimal("0")
        previous_balance = Decimal("0")
        versions: list[TotAnnualSummaryVersion] = []
        for item in ordered:
            tax_due = require_money(item.tax_due)
            amount_paid = require_money(item.amount_paid)
            balance_due = require_money(item.balance_due)
            if balance_due != money(tax_due - amount_paid):
                raise InvalidPayment("The annual summary balance does not match the stored tax")
            tax_change = money(tax_due - previous_tax)
            amount_paid_change = money(amount_paid - previous_paid)
            balance_change = money(balance_due - previous_balance)
            if balance_change != money(tax_change - amount_paid_change):
                raise InvalidPayment("The summary change does not match the stored tax")
            versions.append(
                TotAnnualSummaryVersion(
                    summary_id=item.id,
                    amends_summary_id=item.amends_summary_id,
                    superseded=item.superseded,
                    filing_count=item.filing_count,
                    tax_due=tax_due,
                    amount_paid=amount_paid,
                    balance_due=balance_due,
                    tax_change=tax_change,
                    amount_paid_change=amount_paid_change,
                    balance_change=balance_change,
                    filed_at=item.filed_at,
                )
            )
            previous_tax = tax_due
            previous_paid = amount_paid
            previous_balance = balance_due
        latest = versions[-1]
        root = ordered[0]
        live = await self.get_year_statement(
            conn,
            tax_year=root.tax_year,
            country_code=root.country_code,
        )
        if live.currency_code is None:
            raise InvalidWorksheet("There is no filing to compare with this annual summary")
        if live.currency_code != root.currency_code:
            raise InvalidWorksheet("The year statement currency does not match the summary")
        live_tax = require_money(live.tax_due)
        live_paid = require_money(live.amount_paid)
        live_balance = require_money(live.balance_due)
        if live_balance != money(live_tax - live_paid):
            raise InvalidPayment("The live year balance does not match the stored tax")
        unfiled = TotAnnualSummaryGap(
            tax_due=live_tax,
            amount_paid=live_paid,
            balance_due=live_balance,
            filing_count=len(live.filings),
            tax_change=money(live_tax - latest.tax_due),
            amount_paid_change=money(live_paid - latest.amount_paid),
            balance_change=money(live_balance - latest.balance_due),
        )
        if unfiled.balance_change != money(unfiled.tax_change - unfiled.amount_paid_change):
            raise InvalidPayment("The unfiled summary gap does not match the stored tax")
        return TotAnnualSummaryStatement(
            tenant_id=tenant.id,
            country_code=root.country_code,
            tax_year=root.tax_year,
            currency_code=root.currency_code,
            tax_due=latest.tax_due,
            amount_paid=latest.amount_paid,
            balance_due=latest.balance_due,
            versions=tuple(versions),
            unfiled=unfiled,
        )

    async def get_annual_summary_due(
        self,
        conn: Connection,
        summary_id: UUID,
        *,
        as_of: date | None = None,
        open_returns: tuple[TotReturnBalance, ...] | None = None,
    ) -> TotAnnualSummaryDue:
        """Remind what is still owed to the Sint Maarten Tax Office.

        The filed balance is the latest annual summary. amount_due is the live
        year balance. When a later payment has not been filed, unfiled carries
        that gap and has_unfiled_gap is true. actions names the file-unfiled,
        year-statement, and open-return payment paths for this year.
        """
        statement = await self.get_annual_summary_statement(conn, summary_id)
        latest = statement.versions[-1]
        amount_due = require_money(statement.unfiled.balance_due)
        filed_balance = require_money(latest.balance_due)
        if amount_due != money(filed_balance + statement.unfiled.balance_change):
            raise InvalidPayment("The amount due does not match the filed balance and unfiled gap")
        has_gap = _has_unfiled_gap(statement.unfiled, latest.filing_count)
        day = date.today() if as_of is None else as_of
        actions = await self._due_actions(
            conn,
            summary_id=latest.summary_id,
            country_code=statement.country_code,
            tax_year=statement.tax_year,
            has_unfiled_gap=has_gap,
            as_of=day,
            open_returns=open_returns,
        )
        return TotAnnualSummaryDue(
            tenant_id=statement.tenant_id,
            country_code=statement.country_code,
            tax_year=statement.tax_year,
            currency_code=statement.currency_code,
            summary_id=latest.summary_id,
            filed_tax_due=require_money(latest.tax_due),
            filed_amount_paid=require_money(latest.amount_paid),
            filed_balance_due=filed_balance,
            amount_due=amount_due,
            has_unfiled_gap=has_gap,
            unfiled=statement.unfiled,
            actions=actions,
        )

    async def list_annual_summary_dues(
        self,
        conn: Connection,
        *,
        as_of: date | None = None,
    ) -> TotAnnualSummaryDueList:
        """Pay-due reminders for every tax year with a filed annual summary.

        Only the latest version of each year is listed. Open balances and
        unfiled gaps for the active business show up in one response. Each row
        carries the file-unfiled, year-statement, and payment paths.
        """
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        summaries = await self._summaries.list_summaries(conn)
        latest_by_year: dict[tuple[str, int], TotAnnualSummary] = {}
        for item in summaries:
            if item.superseded:
                continue
            key = (item.country_code, item.tax_year)
            if key not in latest_by_year:
                latest_by_year[key] = item
        ordered_keys = sorted(latest_by_year.keys(), key=lambda item: (-item[1], item[0]))
        day = date.today() if as_of is None else as_of
        balances = await self.list_balances(conn, as_of=day)
        open_by_year: dict[tuple[str, int], list[TotReturnBalance]] = {}
        for row in balances.returns:
            if row.balance_due <= Decimal("0"):
                continue
            open_by_year.setdefault((row.country_code, row.tax_year), []).append(row)
        dues: list[TotAnnualSummaryDue] = []
        for key in ordered_keys:
            dues.append(
                await self.get_annual_summary_due(
                    conn,
                    latest_by_year[key].id,
                    as_of=day,
                    open_returns=tuple(open_by_year.get(key, ())),
                )
            )
        return TotAnnualSummaryDueList(
            tenant_id=tenant.id,
            amount_due=sum_money([row.amount_due for row in dues]),
            unfiled_count=sum(1 for row in dues if row.has_unfiled_gap),
            dues=tuple(dues),
        )

    async def _due_actions(
        self,
        conn: Connection,
        *,
        summary_id: UUID,
        country_code: str,
        tax_year: int,
        has_unfiled_gap: bool,
        as_of: date,
        open_returns: tuple[TotReturnBalance, ...] | None = None,
    ) -> TotAnnualSummaryDueActions:
        if open_returns is None:
            balances = await self.list_balances(conn, as_of=as_of)
            open_returns = tuple(
                row
                for row in balances.returns
                if row.country_code == country_code
                and row.tax_year == tax_year
                and row.balance_due > Decimal("0")
            )
        file_path = (
            f"/api/v1/tax/tot/summaries/{summary_id}/unfiled" if has_unfiled_gap else None
        )
        year_path = (
            f"/api/v1/tax/tot/statements?tax_year={tax_year}&country_code={country_code}"
        )
        return TotAnnualSummaryDueActions(
            can_file_unfiled=has_unfiled_gap,
            file_unfiled_path=file_path,
            year_statement_path=year_path,
            open_returns=tuple(
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
                for row in open_returns
            ),
        )

    async def file_unfiled_annual_summary(
        self,
        conn: Connection,
        summary_id: UUID,
    ) -> TotAnnualSummary:
        """File the live year gap as an amendment of the latest summary.

        Any version in the chain may be named. The earlier rows stay readable.
        A request with no unfiled change is rejected. The stored balance is the
        turnover tax still due to the Sint Maarten Tax Office on the live year.
        """
        statement = await self.get_annual_summary_statement(conn, summary_id)
        latest = statement.versions[-1]
        gap = statement.unfiled
        if not _has_unfiled_gap(gap, latest.filing_count):
            raise InvalidWorksheet("There is no unfiled gap to file for this annual summary")
        current = await self.get_annual_summary(conn, latest.summary_id)
        if current.superseded:
            raise TotAnnualSummarySuperseded("This annual summary has been amended")
        tax_due = require_money(gap.tax_due)
        amount_paid = require_money(gap.amount_paid)
        balance_due = require_money(gap.balance_due)
        if balance_due != money(tax_due - amount_paid):
            raise InvalidPayment("The annual summary balance does not match the stored tax")
        if gap.filing_count < 1:
            raise InvalidWorksheet("There is no filing to summarize for this tax year")
        recorded = await self._summaries.insert(
            conn,
            country_code=statement.country_code,
            tax_year=statement.tax_year,
            currency_code=statement.currency_code,
            filing_count=gap.filing_count,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
            amends_summary_id=current.id,
        )
        await self._tenancy.write_audit(
            conn,
            action="tax.tot.summarize.file_unfiled",
            detail={
                "summary_id": str(recorded.id),
                "amends_summary_id": str(current.id),
                "named_summary_id": str(summary_id),
                "tax_year": recorded.tax_year,
                "filing_count": recorded.filing_count,
                "tax_due": format(recorded.tax_due, "f"),
                "amount_paid": format(recorded.amount_paid, "f"),
                "balance_due": format(recorded.balance_due, "f"),
                "unfiled_amount_paid_change": format(gap.amount_paid_change, "f"),
                "unfiled_balance_change": format(gap.balance_change, "f"),
            },
        )
        return recorded

    async def get_refund(self, conn: Connection, refund_id: UUID) -> TotRefundView:
        await self._tenancy.require_active_tenant(conn)
        found = await self._refunds.get_refund(conn, refund_id)
        if found is None:
            raise TotRefundNotFound("Turnover-tax refund was not found for the active business")
        filed = await self._returns.get_return(conn, found.tot_return_id)
        if filed is None:
            raise TotReturnNotFound("Turnover-tax return was not found for the active business")
        latest = await self._latest(conn, filed)
        tax_due, amount_paid, balance_due, _payments, _refunds = await self._open_statement(conn, latest)
        return TotRefundView(
            refund=found,
            tax_due=tax_due,
            amount_paid=amount_paid,
            balance_due=balance_due,
        )

    async def _statement(
        self,
        conn: Connection,
        filed: TotReturn,
    ) -> tuple[Decimal, Decimal, Decimal, tuple[TotPayment, ...], tuple[TotRefund, ...]]:
        payments = await self._payments.list_for_return(conn, filed.id)
        refunds = await self._refunds.list_for_return(conn, filed.id)
        return _settle(filed.tot_amount, payments, refunds)

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
    ) -> tuple[Decimal, Decimal, Decimal, tuple[TotPayment, ...], tuple[TotRefund, ...]]:
        if filed.superseded:
            raise TotReturnSuperseded("This filing has been amended")
        payments: list[TotPayment] = []
        refunds: list[TotRefund] = []
        current: TotReturn | None = filed
        seen: set[UUID] = set()
        while current is not None and current.id not in seen:
            seen.add(current.id)
            payments.extend(await self._payments.list_for_return(conn, current.id))
            refunds.extend(await self._refunds.list_for_return(conn, current.id))
            if current.amends_return_id is None:
                break
            current = await self._returns.get_return(conn, current.amends_return_id)
        ordered_payments = tuple(sorted(payments, key=lambda item: (item.paid_on, item.recorded_at, str(item.id))))
        ordered_refunds = tuple(
            sorted(refunds, key=lambda item: (item.refunded_on, item.recorded_at, str(item.id)))
        )
        tax_due, amount_paid, balance_due, _payments, _refunds = _settle(
            filed.tot_amount,
            ordered_payments,
            ordered_refunds,
        )
        return tax_due, amount_paid, balance_due, ordered_payments, ordered_refunds


def _settle(
    tax_due: Decimal,
    payments: tuple[TotPayment, ...] | list[TotPayment],
    refunds: tuple[TotRefund, ...] | list[TotRefund],
) -> tuple[Decimal, Decimal, Decimal, tuple[TotPayment, ...], tuple[TotRefund, ...]]:
    due = require_money(tax_due)
    paid = sum_money([row.amount for row in payments])
    refunded = sum_money([row.amount for row in refunds])
    if refunded > paid:
        raise InvalidPayment("Refunds exceed the amount paid")
    amount_paid = money(paid - refunded)
    if amount_paid > due:
        raise InvalidPayment("Payments exceed the filed turnover tax")
    balance_due = money(due - amount_paid)
    return due, amount_paid, balance_due, tuple(payments), tuple(refunds)


def _running_lines(
    tax_due: Decimal,
    payments: tuple[TotPayment, ...],
    refunds: tuple[TotRefund, ...],
    starting_balance: Decimal | None = None,
) -> tuple[TotStatementLine, ...]:
    movements: list[tuple[date, datetime, str, UUID, UUID, Decimal]] = []
    for payment in payments:
        movements.append(
            (payment.paid_on, payment.recorded_at, "payment", payment.id, payment.tot_return_id, payment.amount)
        )
    for refund in refunds:
        movements.append(
            (
                refund.refunded_on,
                refund.recorded_at,
                "refund",
                refund.id,
                refund.tot_return_id,
                refund.amount,
            )
        )
    movements.sort(key=lambda item: (item[0], item[1], item[2], str(item[3])))
    balance = require_money(tax_due if starting_balance is None else starting_balance)
    lines: list[TotStatementLine] = []
    for entry_date, recorded_at, kind, movement_id, return_id, amount in movements:
        posted = require_money(amount)
        if kind == "payment":
            balance = money(balance - posted)
        else:
            balance = money(balance + posted)
        if balance < 0:
            raise InvalidPayment("Payments exceed the filed turnover tax")
        lines.append(
            TotStatementLine(
                kind=kind,
                id=movement_id,
                tot_return_id=return_id,
                amount=posted,
                entry_date=entry_date,
                recorded_at=recorded_at,
                balance=balance,
            )
        )
    return tuple(lines)


def _paid_along_chain(latest: TotFiledTax, by_id: dict[UUID, TotFiledTax]) -> Decimal:
    paid = Decimal("0")
    refunded = Decimal("0")
    seen: set[UUID] = set()
    current: TotFiledTax | None = latest
    while current is not None and current.return_id not in seen:
        seen.add(current.return_id)
        paid = money(paid + require_money(current.amount_paid))
        refunded = money(refunded + require_money(current.amount_refunded))
        parent_id = current.amends_return_id
        current = None if parent_id is None else by_id.get(parent_id)
    if refunded > paid:
        raise InvalidPayment("Refunds exceed the amount paid")
    return money(paid - refunded)


def _has_unfiled_gap(gap: TotAnnualSummaryGap, filed_filing_count: int) -> bool:
    zero = money(Decimal("0"))
    return (
        gap.tax_change != zero
        or gap.amount_paid_change != zero
        or gap.balance_change != zero
        or gap.filing_count != filed_filing_count
    )


def _same_summary_year(left: TotAnnualSummary, right: TotAnnualSummary) -> None:
    if (
        left.tax_year != right.tax_year
        or left.country_code != right.country_code
        or left.currency_code != right.currency_code
    ):
        raise InvalidWorksheet("The annual summary chain does not stay in one tax year")


def _summary_chain(
    summaries: tuple[TotAnnualSummary, ...],
    summary_id: UUID,
) -> tuple[TotAnnualSummary, ...]:
    """Original first, then each amendment. Every row stays in the list."""
    by_id = {item.id: item for item in summaries}
    if summary_id not in by_id:
        raise TotAnnualSummaryNotFound("Annual summary was not found for the active business")
    current = by_id[summary_id]
    seen: set[UUID] = set()
    while True:
        if current.id in seen:
            raise InvalidWorksheet("The annual summary chain repeats a summary")
        seen.add(current.id)
        if current.amends_summary_id is None:
            break
        prior = by_id.get(current.amends_summary_id)
        if prior is None:
            raise TotAnnualSummaryNotFound("Annual summary was not found for the active business")
        _same_summary_year(prior, current)
        current = prior
    children: dict[UUID, TotAnnualSummary] = {}
    for item in summaries:
        if item.amends_summary_id is None:
            continue
        if item.amends_summary_id in children:
            raise InvalidWorksheet("An annual summary has more than one amendment")
        children[item.amends_summary_id] = item
    ordered = [current]
    followed = {current.id}
    while current.id in children:
        nxt = children[current.id]
        if nxt.id in followed:
            raise InvalidWorksheet("The annual summary chain repeats a summary")
        _same_summary_year(nxt, ordered[0])
        followed.add(nxt.id)
        ordered.append(nxt)
        current = nxt
    return tuple(ordered)
