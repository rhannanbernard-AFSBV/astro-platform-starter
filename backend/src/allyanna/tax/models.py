"""Tax rows loaded from the database. Rates are not constants in this package."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID


@dataclass(frozen=True)
class TaxSchedule:
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


@dataclass(frozen=True)
class WageTaxBracket:
    bracket_order: int
    income_from: Decimal
    income_to: Decimal | None
    rate: Decimal
    base_tax: Decimal


@dataclass(frozen=True)
class SzvComponent:
    component_order: int
    component_code: str
    group_code: str
    employee_rate: Decimal
    employer_rate: Decimal
    monthly_wage_ceiling: Decimal
    annual_wage_ceiling: Decimal | None
    employer_rate_min: Decimal | None
    employer_rate_max: Decimal | None
    rate_is_variable: bool
    reduces_wage_tax_base: bool = False


@dataclass(frozen=True)
class WageTaxLookupRow:
    wage_amount: Decimal
    tax_amount: Decimal


@dataclass(frozen=True)
class WageTaxWithholdingRules:
    withholding_free_maximum: Decimal
    excess_rate: Decimal
    monthly_acquisition_cost: Decimal


@dataclass(frozen=True)
class TaxBundle:
    schedule: TaxSchedule
    tot_rate: Decimal | None
    brackets: tuple[WageTaxBracket, ...]
    components: tuple[SzvComponent, ...]
    withholding_rules: WageTaxWithholdingRules | None = None
    lookup_rows: tuple[WageTaxLookupRow, ...] = ()


@dataclass(frozen=True)
class TotResult:
    gross_taxable_revenue: Decimal
    rate: Decimal
    tot_amount: Decimal


@dataclass(frozen=True)
class WageTaxResult:
    taxable_wage: Decimal
    tax_amount: Decimal
    bracket: WageTaxBracket | None


@dataclass(frozen=True)
class MonthlyWageTaxResult:
    wage_tax_base: Decimal
    tax_amount: Decimal
    method: str
    table_wage_amount: Decimal | None
    table_tax_amount: Decimal | None
    excess_wage: Decimal
    excess_rate: Decimal


@dataclass(frozen=True)
class SzvLine:
    component_code: str
    group_code: str
    monthly_wage_ceiling: Decimal
    capped_wage: Decimal
    employee_rate: Decimal
    employer_rate: Decimal
    employer_rate_source: str
    employee_amount: Decimal
    employer_amount: Decimal


@dataclass(frozen=True)
class SzvGroupTotal:
    group_code: str
    employee_amount: Decimal
    employer_amount: Decimal


@dataclass(frozen=True)
class SzvResult:
    gross_monthly_wage: Decimal
    lines: tuple[SzvLine, ...]
    groups: tuple[SzvGroupTotal, ...]
    employee_total: Decimal
    employer_total: Decimal
