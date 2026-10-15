"""Review and period-readiness rows for the active business profile."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from allyanna.worksheets.models import TotAnnualSummaryDue, TotDueOpenReturn


@dataclass(frozen=True)
class IntakeReview:
    """Whether a completed intake is ready to post into the invoice ledger.

    Table TOT is the recomputed amount. Printed TOT is stored beside it.
    ready_to_post is true only when the intake is completed, amounts match,
    it is not already posted, and the invoice date is not in a filed period.
    """

    document_id: UUID
    tenant_id: UUID
    status: str
    source_filename: str
    vendor_name: str | None
    invoice_date: date | None
    tax_year: int | None
    country_code: str | None
    extracted_tot_amount: Decimal | None
    table_tot_amount: Decimal | None
    tot_rate: Decimal | None
    subtotal: Decimal | None
    grand_total: Decimal | None
    amounts_match: bool | None
    discrepancies: tuple[str, ...]
    ready_to_post: bool
    blocked_reason: str | None
    post_path: str | None
    invoice_id: UUID | None


@dataclass(frozen=True)
class IntakeReviewList:
    tenant_id: UUID
    ready_count: int
    blocked_count: int
    reviews: tuple[IntakeReview, ...]


@dataclass(frozen=True)
class UnfiledInvoice:
    """A posted invoice whose date is not yet covered by a filed return."""

    invoice_id: UUID
    vendor_name: str
    invoice_date: date
    tax_year: int
    country_code: str
    currency_code: str
    subtotal: Decimal
    tot_rate: Decimal
    tot_amount: Decimal
    grand_total: Decimal
    document_intake_id: UUID | None


@dataclass(frozen=True)
class TotPeriodReadiness:
    """What still needs posting, filing, or paying for one tax year.

    Intakes are OCR rows. Unfiled invoices are posted but not in a return.
    Open returns still owe turnover tax. dues carries the annual-summary
    pay-due reminder when one exists for the year.
    """

    tenant_id: UUID
    tax_year: int
    country_code: str
    ready_count: int
    blocked_count: int
    unfiled_invoice_count: int
    open_return_count: int
    unfiled_tot_amount: Decimal
    open_balance: Decimal
    intakes_ready: tuple[IntakeReview, ...]
    intakes_blocked: tuple[IntakeReview, ...]
    unfiled_invoices: tuple[UnfiledInvoice, ...]
    open_returns: tuple[TotDueOpenReturn, ...]
    dues: TotAnnualSummaryDue | None
