"""A turnover-tax worksheet is the posted invoices in one period."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID


@dataclass(frozen=True)
class PeriodInvoice:
    id: UUID
    vendor_name: str
    invoice_date: date
    subtotal: Decimal
    tot_rate: Decimal
    tot_amount: Decimal
    grand_total: Decimal


@dataclass(frozen=True)
class TotWorksheet:
    tenant_id: UUID
    period_start: date
    period_end: date
    tax_year: int
    country_code: str
    currency_code: str
    schedule_id: UUID
    rate: Decimal
    invoice_count: int
    subtotal: Decimal
    tot_amount: Decimal
    grand_total: Decimal
    invoices: tuple[PeriodInvoice, ...]


@dataclass(frozen=True)
class TotReturn:
    id: UUID
    tenant_id: UUID
    country_code: str
    tax_year: int
    period_start: date
    period_end: date
    currency_code: str
    schedule_id: UUID
    rate: Decimal
    invoice_count: int
    subtotal: Decimal
    tot_amount: Decimal
    grand_total: Decimal
    due_on: date | None
    amends_return_id: UUID | None
    superseded: bool
    filed_at: datetime


@dataclass(frozen=True)
class TotPayment:
    id: UUID
    tenant_id: UUID
    tot_return_id: UUID
    amount: Decimal
    paid_on: date
    recorded_at: datetime


@dataclass(frozen=True)
class TotRefund:
    id: UUID
    tenant_id: UUID
    tot_return_id: UUID
    amount: Decimal
    refunded_on: date
    recorded_at: datetime


@dataclass(frozen=True)
class TotPaymentView:
    payment: TotPayment
    tax_due: Decimal
    amount_paid: Decimal
    balance_due: Decimal


@dataclass(frozen=True)
class TotPaymentList:
    tenant_id: UUID
    tot_return_id: UUID
    tax_due: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    payments: tuple[TotPayment, ...]


@dataclass(frozen=True)
class TotRefundView:
    refund: TotRefund
    tax_due: Decimal
    amount_paid: Decimal
    balance_due: Decimal


@dataclass(frozen=True)
class TotRefundList:
    tenant_id: UUID
    tot_return_id: UUID
    tax_due: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    refunds: tuple[TotRefund, ...]


@dataclass(frozen=True)
class TotStatementLine:
    kind: str
    id: UUID
    tot_return_id: UUID
    amount: Decimal
    entry_date: date
    recorded_at: datetime
    balance: Decimal


@dataclass(frozen=True)
class TotStatement:
    tenant_id: UUID
    tot_return_id: UUID
    tax_due: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    lines: tuple[TotStatementLine, ...]


@dataclass(frozen=True)
class TotFiledTax:
    return_id: UUID
    tenant_id: UUID
    country_code: str
    tax_year: int
    period_start: date
    period_end: date
    currency_code: str
    due_on: date | None
    amends_return_id: UUID | None
    tax_due: Decimal
    amount_paid: Decimal
    amount_refunded: Decimal


@dataclass(frozen=True)
class TotReturnBalance:
    return_id: UUID
    tenant_id: UUID
    country_code: str
    tax_year: int
    period_start: date
    period_end: date
    currency_code: str
    due_on: date | None
    tax_due: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    past_due: bool


@dataclass(frozen=True)
class TotBalanceList:
    tenant_id: UUID
    as_of: date
    tax_due: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    past_due_balance: Decimal
    returns: tuple[TotReturnBalance, ...]
