"""Sint Maarten hardcoded mathematical engine (Decimal only — never float)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from app.schemas import TaxRatesSXM, WageTaxSzvData

_PENNY = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(_PENNY, rounding=ROUND_HALF_UP)


def _progressive_wage_tax(
    gross_monthly_salary: Decimal, rates: TaxRatesSXM
) -> Decimal:
    """Apply progressive brackets from configurable tax-table data (Pillar 2)."""
    wage_tax = Decimal("0.00")
    remaining = gross_monthly_salary
    previous_cap = Decimal("0.00")

    for bracket in rates.wage_tax_brackets:
        if remaining <= 0:
            break
        if bracket.up_to is None:
            taxable_in_band = remaining
        else:
            band_width = bracket.up_to - previous_cap
            if band_width <= 0:
                previous_cap = bracket.up_to
                continue
            taxable_in_band = min(remaining, band_width)

        wage_tax += taxable_in_band * bracket.rate
        remaining -= taxable_in_band
        if bracket.up_to is not None:
            previous_cap = bracket.up_to

    return _q(wage_tax)


def calculate_sxm_wage_tax_and_szv(
    gross_monthly_salary: Decimal, rates: TaxRatesSXM
) -> WageTaxSzvData:
    """
    Progressive wage tax + capped SZV (AOV) premiums for Sint Maarten.

    Bracket rates and SZV cap/percentages come from ``rates`` (Pillar 2),
    never from literals inside the math loop.
    """
    assessable_szv_wage = min(gross_monthly_salary, rates.szv_wage_cap)

    szv_aov_employer = _q(assessable_szv_wage * rates.szv_aov_employer_pct)
    szv_aov_employee = _q(assessable_szv_wage * rates.szv_aov_employee_pct)

    wage_tax = _progressive_wage_tax(gross_monthly_salary, rates)
    net_salary = _q(gross_monthly_salary - szv_aov_employee - wage_tax)

    return WageTaxSzvData(
        gross_monthly_salary=_q(gross_monthly_salary),
        szv_assessable_wage=_q(assessable_szv_wage),
        szv_aov_employer_contribution=szv_aov_employer,
        szv_aov_employee_deduction=szv_aov_employee,
        wage_tax_deduction=wage_tax,
        net_take_home_pay=net_salary,
    )
