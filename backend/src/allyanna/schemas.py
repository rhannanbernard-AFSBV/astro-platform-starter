"""Explicit response models. Money and rates serialize as decimal strings."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from allyanna.money import Money, Rate


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
    reduces_wage_tax_base: bool


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


class WageTaxLookupSummary(BaseModel):
    withholding_free_maximum: Money
    excess_rate: Rate
    monthly_acquisition_cost: Money
    row_count: int
    first_wage_amount: Money
    last_wage_amount: Money
    last_tax_amount: Money


class MonthlyWageTaxRequest(TaxQuery):
    wage_tax_base: Decimal

    @field_validator("wage_tax_base", mode="before")
    @classmethod
    def money_is_decimal(cls, value: object) -> object:
        return _reject_json_float(value)


class MonthlyWageTaxResponse(BaseModel):
    tenant_id: UUID
    tax_year: int
    country_code: str
    currency_code: str
    amount_period: str
    schedule_id: UUID
    wage_tax_base: Money
    tax_amount: Money
    method: str
    table_wage_amount: Money | None
    table_tax_amount: Money | None
    excess_wage: Money
    excess_rate: Rate
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
    withholding: WageTaxLookupSummary | None = None


class PayrollLineRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_name: str = Field(min_length=1, max_length=200)
    employee_code: str | None = Field(default=None, max_length=40)
    gross_wage: Decimal

    @field_validator("employee_name", "employee_code", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        if isinstance(value, str):
            stripped = value.strip()
            return None if stripped == "" else stripped
        return value

    @field_validator("gross_wage", mode="before")
    @classmethod
    def money_is_decimal(cls, value: object) -> object:
        return _reject_json_float(value)


class PayrollRunCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_year: int = Field(ge=2000, le=2100)
    period_month: int = Field(ge=1, le=12)
    ov_employer_rate: Decimal | None = None
    lines: list[PayrollLineRequest] = Field(min_length=1, max_length=100)

    @field_validator("ov_employer_rate", mode="before")
    @classmethod
    def money_is_decimal(cls, value: object) -> object:
        return _reject_json_float(value)


class PayrollSzvLineResponse(BaseModel):
    component_code: str
    group_code: str
    capped_wage: Money
    employee_rate: Rate
    employer_rate: Rate
    employee_amount: Money
    employer_amount: Money


class PayrollLineResponse(BaseModel):
    id: UUID
    line_number: int
    employee_name: str
    employee_code: str | None
    gross_wage: Money
    acquisition_cost: Money
    aov_aww_employee_deduction: Money
    wage_tax_base: Money
    wage_tax_withheld: Money
    withholding_method: str
    table_wage_amount: Money | None
    table_tax_amount: Money | None
    excess_wage: Money
    excess_rate: Rate
    employee_szv_total: Money
    employer_szv_total: Money
    net_wage: Money
    szv_lines: list[PayrollSzvLineResponse]


class PayrollRunResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    period_year: int
    period_month: int
    country_code: str
    currency_code: str
    wage_tax_schedule_id: UUID
    szv_schedule_id: UUID
    employee_count: int
    gross_wages: Money
    employee_szv_total: Money
    employer_szv_total: Money
    wage_tax_total: Money
    net_wages: Money
    created_at: datetime
    lines: list[PayrollLineResponse]


class PayrollRunListResponse(BaseModel):
    tenant_id: UUID
    runs: list[PayrollRunResponse]


class TaxSchedulesResponse(BaseModel):
    country_code: str
    tax_year: int
    schedules: list[TaxScheduleResponse]
