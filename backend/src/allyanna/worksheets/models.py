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
    filed_at: datetime
