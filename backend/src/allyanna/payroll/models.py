"""Payroll rows stored for one business profile."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID


@dataclass(frozen=True)
class PayrollLineInput:
    employee_name: str
    employee_code: str | None
    gross_wage: Decimal


@dataclass(frozen=True)
class PayrollSzvLine:
    component_code: str
    group_code: str
    capped_wage: Decimal
    employee_rate: Decimal
    employer_rate: Decimal
    employee_amount: Decimal
    employer_amount: Decimal


@dataclass(frozen=True)
class PayrollLine:
    id: UUID
    line_number: int
    employee_name: str
    employee_code: str | None
    gross_wage: Decimal
    acquisition_cost: Decimal
    aov_aww_employee_deduction: Decimal
    wage_tax_base: Decimal
    wage_tax_withheld: Decimal
    withholding_method: str
    table_wage_amount: Decimal | None
    table_tax_amount: Decimal | None
    excess_wage: Decimal
    excess_rate: Decimal
    employee_szv_total: Decimal
    employer_szv_total: Decimal
    net_wage: Decimal
    szv_lines: tuple[PayrollSzvLine, ...]


@dataclass(frozen=True)
class PayrollRun:
    id: UUID
    tenant_id: UUID
    period_year: int
    period_month: int
    country_code: str
    currency_code: str
    wage_tax_schedule_id: UUID
    szv_schedule_id: UUID
    employee_count: int
    gross_wages: Decimal
    employee_szv_total: Decimal
    employer_szv_total: Decimal
    wage_tax_total: Decimal
    net_wages: Decimal
    created_at: datetime
    lines: tuple[PayrollLine, ...]
