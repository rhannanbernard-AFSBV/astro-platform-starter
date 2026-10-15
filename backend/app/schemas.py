"""Pydantic request/response models for Allyanna SXM compliance APIs."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class TenantContext(BaseModel):
    """Pillar 1: tenant identity carried on every request (RLS application state)."""

    tenant_id: UUID
    user_id: UUID
    role: str  # 'owner', 'employee', 'external_accountant' (Pillar 3)


class WageTaxBracket(BaseModel):
    """One progressive wage-tax step from configurable tax tables (Pillar 2)."""

    up_to: Optional[Decimal] = Field(
        default=None,
        description="Inclusive upper bound of this band; null means open-ended.",
    )
    rate: Decimal

    @field_validator("up_to", "rate", mode="before")
    @classmethod
    def parse_optional_decimal(cls, v):
        if v is None:
            return None
        return Decimal(str(v))


class TaxRatesSXM(BaseModel):
    """Pillar 2: configurable SXM tax table row (DB-cache / JSON stand-in)."""

    tax_year: int
    country_code: str = "SXM"
    tot_percentage: Decimal = Field(default=Decimal("0.05"))
    szv_wage_cap: Decimal = Field(default=Decimal("5600.00"))
    szv_aov_employer_pct: Decimal = Field(default=Decimal("0.0825"))
    szv_aov_employee_pct: Decimal = Field(default=Decimal("0.0475"))
    wage_tax_brackets: list[WageTaxBracket] = Field(default_factory=list)

    @field_validator(
        "tot_percentage",
        "szv_wage_cap",
        "szv_aov_employer_pct",
        "szv_aov_employee_pct",
        mode="before",
    )
    @classmethod
    def parse_decimal(cls, v):
        return Decimal(str(v))


class ChatQueryRequest(BaseModel):
    user_prompt: str
    tax_year: int = 2026


class TotCalculationData(BaseModel):
    """Penny-perfect TOT result — all money fields are Decimal (never float)."""

    gross_revenue: Decimal
    tot_rate: Decimal
    tot_due: Decimal
    net_revenue: Decimal

    @field_validator(
        "gross_revenue", "tot_rate", "tot_due", "net_revenue", mode="before"
    )
    @classmethod
    def parse_decimal(cls, v):
        return Decimal(str(v))


class WageTaxSzvData(BaseModel):
    """Wage tax + capped SZV result — all money fields are Decimal (never float)."""

    gross_monthly_salary: Decimal
    szv_assessable_wage: Decimal
    szv_aov_employer_contribution: Decimal
    szv_aov_employee_deduction: Decimal
    wage_tax_deduction: Decimal
    net_take_home_pay: Decimal

    @field_validator(
        "gross_monthly_salary",
        "szv_assessable_wage",
        "szv_aov_employer_contribution",
        "szv_aov_employee_deduction",
        "wage_tax_deduction",
        "net_take_home_pay",
        mode="before",
    )
    @classmethod
    def parse_decimal(cls, v):
        return Decimal(str(v))


class ComplianceCalculationResponse(BaseModel):
    tenant_id: UUID
    source: Literal["Hardcoded Calculation Engine"] = "Hardcoded Calculation Engine"
    calculation_type: Literal["tot", "wage_tax_szv"]
    data: Union[TotCalculationData, WageTaxSzvData]


class ComplianceConversationResponse(BaseModel):
    tenant_id: UUID
    source: Literal["AI Conversational Engine"] = "AI Conversational Engine"
    message: Optional[str] = None


ComplianceChatResponse = Union[ComplianceCalculationResponse, ComplianceConversationResponse]


class ReceiptExtractionResponse(BaseModel):
    vendor_name: str
    invoice_date: str
    subtotal: Decimal
    tot_amount: Decimal
    grand_total: Decimal

    @field_validator("subtotal", "tot_amount", "grand_total", mode="before")
    @classmethod
    def parse_decimal(cls, v):
        return Decimal(str(v))


class OcrRequest(BaseModel):
    file_url: str


class OcrJobResponse(BaseModel):
    """Async OCR intake acknowledgement / extraction payload."""

    tenant_id: UUID
    status: Literal["extracted", "accepted"]
    extraction: Optional[ReceiptExtractionResponse] = None


class InvoicePersistRequest(BaseModel):
    """OCR extraction payload persisted into ``invoices`` under RLS."""

    vendor_name: str = Field(..., min_length=1)
    invoice_date: str = Field(
        ...,
        description="ISO date string (YYYY-MM-DD) extracted from the document.",
    )
    subtotal: Decimal = Field(..., ge=0)
    tot_amount: Decimal = Field(..., ge=0)
    grand_total: Decimal = Field(..., ge=0)

    @field_validator("subtotal", "tot_amount", "grand_total", mode="before")
    @classmethod
    def parse_money(cls, v):
        if isinstance(v, float):
            return Decimal(str(v))
        return Decimal(str(v))


class InvoicePersistResponse(BaseModel):
    status: Literal["Success"] = "Success"
    message: str
    invoice_id: UUID
    tenant_id: UUID
    vendor_name: str
    invoice_date: str
    subtotal: Decimal
    tot_amount: Decimal
    grand_total: Decimal


class MonthlyPayrollRunRequest(BaseModel):
    """Request body for POST /api/v1/payroll/process-monthly-run."""

    employee_name: str = Field(..., min_length=1)
    gross_salary: Decimal = Field(..., gt=0)
    tax_year: int = Field(default=2026, description="Pillar 2 tax-table year")

    @field_validator("gross_salary", mode="before")
    @classmethod
    def parse_gross_salary(cls, v):
        # Never accept native float into money math — coerce via str first.
        if isinstance(v, float):
            return Decimal(str(v))
        return Decimal(str(v))


class MonthlyPayrollRunResponse(BaseModel):
    """Explicit response model for a secured monthly payroll run."""

    status: str
    message: str
    payroll_record_id: UUID
    tenant_id: UUID
    calculations: WageTaxSzvData


class TenantSessionProbeResponse(BaseModel):
    tenant_id: UUID
    rls_guc_bound: bool


class HealthResponse(BaseModel):
    status: str
    service: str
