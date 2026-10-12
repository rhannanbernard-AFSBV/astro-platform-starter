"""Invoice rows stored for one business profile."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID


@dataclass(frozen=True)
class InvoiceLineInput:
    description: str
    quantity: Decimal
    unit_price: Decimal


@dataclass(frozen=True)
class PricedLine:
    line_number: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class InvoiceLine:
    id: UUID
    line_number: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    line_total: Decimal


@dataclass(frozen=True)
class Invoice:
    id: UUID
    tenant_id: UUID
    vendor_name: str
    invoice_number: str | None
    invoice_date: date
    due_date: date | None
    currency_code: str
    tax_year: int
    country_code: str
    tax_schedule_id: UUID
    subtotal: Decimal
    tot_rate: Decimal
    tot_amount: Decimal
    grand_total: Decimal
    lines: tuple[InvoiceLine, ...]
