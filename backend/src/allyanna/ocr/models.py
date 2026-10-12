"""Stored intake rows. File bytes stay out of the API model."""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID


@dataclass(frozen=True)
class IntakeLine:
    line_number: int
    description: str
    quantity: Decimal
    unit_price: Decimal
    extracted_line_total: Decimal | None
    line_total: Decimal


@dataclass(frozen=True)
class DocumentIntake:
    id: UUID
    tenant_id: UUID
    status: str
    source_filename: str
    content_type: str
    vendor_name: str | None
    invoice_date: date | None
    currency_code: str | None
    tax_year: int | None
    country_code: str | None
    tax_schedule_id: UUID | None
    extracted_subtotal: Decimal | None
    extracted_tot_amount: Decimal | None
    extracted_grand_total: Decimal | None
    subtotal: Decimal | None
    tot_rate: Decimal | None
    tot_amount: Decimal | None
    grand_total: Decimal | None
    amounts_match: bool | None
    discrepancies: tuple[str, ...]
    error_message: str | None
    lines: tuple[IntakeLine, ...]
    created_at: datetime
    completed_at: datetime | None


@dataclass(frozen=True)
class ClaimedUpload:
    content: bytes
    content_type: str
    source_filename: str
