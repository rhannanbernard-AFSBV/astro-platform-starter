"""Explicit response models. Money and rates serialize as decimal strings."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from allyanna.money import Money, Quantity, Rate


def _reject_json_float(value: object) -> object:
    if isinstance(value, float):
        raise ValueError("send decimal amounts as strings")
    return value


class ErrorResponse(BaseModel):
    code: str
    message: str


class HealthResponse(BaseModel):
    status: str
    service: str


class MasterAccountResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    role: str


class TenantResponse(BaseModel):
    id: UUID
    master_account_id: UUID
    legal_name: str
    trade_name: str | None
    country_code: str
    crib_number: str | None
    status: str
    ov_employer_rate: Rate | None


class ContextResponse(BaseModel):
    user_id: UUID
    email: str
    display_name: str
    master_accounts: list[MasterAccountResponse]
    active_master_account: MasterAccountResponse | None
    active_tenant: TenantResponse | None
    available_tenants: list[TenantResponse]
    switched_at: datetime | None


class SwitchContextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tenant_id: UUID


class TaxQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tax_year: int = Field(ge=2000, le=2100)
    country_code: str = Field(default="SXM", pattern=r"^[A-Z]{3}$")


class TotRequest(TaxQuery):
    gross_taxable_revenue: Decimal

    @field_validator("gross_taxable_revenue", mode="before")
    @classmethod
    def money_is_decimal(cls, value: object) -> object:
        return _reject_json_float(value)


class WageTaxRequest(TaxQuery):
    taxable_wage: Decimal

    @field_validator("taxable_wage", mode="before")
    @classmethod
    def money_is_decimal(cls, value: object) -> object:
        return _reject_json_float(value)


class SzvRequest(TaxQuery):
    gross_monthly_wage: Decimal
    ov_employer_rate: Decimal | None = None

    @field_validator("gross_monthly_wage", "ov_employer_rate", mode="before")
    @classmethod
    def money_is_decimal(cls, value: object) -> object:
        return _reject_json_float(value)


class TotResponse(BaseModel):
    tenant_id: UUID
    tax_year: int
    country_code: str
    currency_code: str
    schedule_id: UUID
    gross_taxable_revenue: Money
    rate: Rate
    tot_amount: Money
    source_note: str


class WageTaxBracketResponse(BaseModel):
    bracket_order: int
    income_from: Money
    income_to: Money | None
    rate: Rate
    base_tax: Money


class WageTaxResponse(BaseModel):
    tenant_id: UUID
    tax_year: int
    country_code: str
    currency_code: str
    amount_period: str
    schedule_id: UUID
    taxable_wage: Money
    tax_amount: Money
    applied_bracket: WageTaxBracketResponse | None
    source_note: str


class SzvComponentTableResponse(BaseModel):
    component_order: int
    component_code: str
    group_code: str
    employee_rate: Rate
    employer_rate: Rate
    monthly_wage_ceiling: Money
    annual_wage_ceiling: Money | None
    employer_rate_min: Rate | None
    employer_rate_max: Rate | None
    rate_is_variable: bool


class SzvComponentResponse(BaseModel):
    component_code: str
    group_code: str
    monthly_wage_ceiling: Money
    annual_wage_ceiling: Money | None
    capped_wage: Money
    employee_rate: Rate
    employer_rate: Rate
    employer_rate_source: str
    employee_amount: Money
    employer_amount: Money


class SzvGroupResponse(BaseModel):
    group_code: str
    employee_amount: Money
    employer_amount: Money


class SzvResponse(BaseModel):
    tenant_id: UUID
    tax_year: int
    country_code: str
    currency_code: str
    amount_period: str
    schedule_id: UUID
    gross_monthly_wage: Money
    components: list[SzvComponentResponse]
    groups: list[SzvGroupResponse]
    employee_total: Money
    employer_total: Money
    source_note: str


class TaxScheduleResponse(BaseModel):
    id: UUID
    country_code: str
    tax_year: int
    schedule_code: str
    calculation_method: str
    amount_period: str
    currency_code: str
    lower_inclusive: bool
    upper_inclusive: bool
    effective_from: date
    effective_to: date | None
    source_note: str
    tot_rate: Rate | None
    brackets: list[WageTaxBracketResponse]
    components: list[SzvComponentTableResponse]


class TaxSchedulesResponse(BaseModel):
    country_code: str
    tax_year: int
    schedules: list[TaxScheduleResponse]


class DocumentLineResponse(BaseModel):
    line_number: int
    description: str
    quantity: Quantity
    unit_price: Money
    extracted_line_total: Money | None
    line_total: Money


class DocumentIntakeResponse(BaseModel):
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
    extracted_subtotal: Money | None
    extracted_tot_amount: Money | None
    extracted_grand_total: Money | None
    subtotal: Money | None
    tot_rate: Rate | None
    tot_amount: Money | None
    grand_total: Money | None
    amounts_match: bool | None
    discrepancies: list[str]
    error_message: str | None
    lines: list[DocumentLineResponse]
    created_at: datetime
    completed_at: datetime | None


class DocumentIntakeListResponse(BaseModel):
    tenant_id: UUID
    documents: list[DocumentIntakeResponse]


class InvoiceLineRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=1, max_length=400)
    quantity: Decimal
    unit_price: Decimal

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("quantity", "unit_price", mode="before")
    @classmethod
    def money_is_decimal(cls, value: object) -> object:
        return _reject_json_float(value)


class InvoiceCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vendor_name: str = Field(min_length=1, max_length=200)
    invoice_number: str | None = Field(default=None, max_length=40)
    invoice_date: date
    due_date: date | None = None
    tax_year: int = Field(ge=2000, le=2100)
    country_code: str = Field(default="SXM", pattern=r"^[A-Z]{3}$")
    lines: list[InvoiceLineRequest] = Field(min_length=1, max_length=100)

    @field_validator("vendor_name", mode="before")
    @classmethod
    def strip_vendor(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("invoice_number", mode="before")
    @classmethod
    def blank_number(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value


class InvoiceLineResponse(BaseModel):
    id: UUID
    line_number: int
    description: str
    quantity: Quantity
    unit_price: Money
    line_total: Money


class InvoiceResponse(BaseModel):
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
    subtotal: Money
    tot_rate: Rate
    tot_amount: Money
    grand_total: Money
    document_intake_id: UUID | None = None
    lines: list[InvoiceLineResponse]


class InvoiceListResponse(BaseModel):
    tenant_id: UUID
    invoices: list[InvoiceResponse]


class TotWorksheetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_start: date
    period_end: date
    tax_year: int = Field(ge=2000, le=2100)
    country_code: str = Field(default="SXM", pattern=r"^[A-Z]{3}$")


class TotWorksheetInvoiceResponse(BaseModel):
    id: UUID
    vendor_name: str
    invoice_date: date
    subtotal: Money
    tot_rate: Rate
    tot_amount: Money
    grand_total: Money


class TotWorksheetResponse(BaseModel):
    tenant_id: UUID
    period_start: date
    period_end: date
    tax_year: int
    country_code: str
    currency_code: str
    schedule_id: UUID
    rate: Rate
    invoice_count: int
    subtotal: Money
    tot_amount: Money
    grand_total: Money
    invoices: list[TotWorksheetInvoiceResponse]


class TotReturnResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    country_code: str
    tax_year: int
    period_start: date
    period_end: date
    currency_code: str
    schedule_id: UUID
    rate: Rate
    invoice_count: int
    subtotal: Money
    tot_amount: Money
    grand_total: Money
    filed_at: datetime


class TotReturnListResponse(BaseModel):
    tenant_id: UUID
    returns: list[TotReturnResponse]
