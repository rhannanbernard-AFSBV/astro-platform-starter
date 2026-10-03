"""Focused unit tests for SXM TOT and wage/SZV Decimal math."""

from __future__ import annotations

from decimal import Decimal

from app.schemas import TaxRatesSXM, WageTaxBracket
from app.tax_engine import calculate_sxm_tot, calculate_sxm_wage_tax_and_szv


def test_tot_basic_five_percent(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_tot(Decimal("1000.00"), sxm_2026_rates)
    assert result.gross_revenue == Decimal("1000.00")
    assert result.tot_rate == Decimal("0.05")
    assert result.tot_due == Decimal("50.00")
    assert result.net_revenue == Decimal("950.00")
    assert isinstance(result.tot_due, Decimal)
    assert not isinstance(result.tot_due, float)


def test_tot_penny_rounding_half_up(sxm_2026_rates: TaxRatesSXM) -> None:
    # 10.15 * 0.05 = 0.5075 → ROUND_HALF_UP → 0.51
    result = calculate_sxm_tot(Decimal("10.15"), sxm_2026_rates)
    assert result.tot_due == Decimal("0.51")
    assert result.net_revenue == Decimal("9.64")


def test_tot_penny_rounding_exact_half(sxm_2026_rates: TaxRatesSXM) -> None:
    # 33.30 * 0.05 = 1.665 → ROUND_HALF_UP → 1.67
    result = calculate_sxm_tot(Decimal("33.30"), sxm_2026_rates)
    assert result.tot_due == Decimal("1.67")
    assert result.net_revenue == Decimal("31.63")


def test_tot_uses_rate_from_table_not_literal() -> None:
    rates = TaxRatesSXM(
        tax_year=2026,
        tot_percentage=Decimal("0.07"),
        szv_wage_cap=Decimal("5600.00"),
        szv_aov_employer_pct=Decimal("0.0825"),
        szv_aov_employee_pct=Decimal("0.0475"),
        wage_tax_brackets=[WageTaxBracket(up_to=None, rate=Decimal("0.10"))],
    )
    result = calculate_sxm_tot(Decimal("200.00"), rates)
    assert result.tot_due == Decimal("14.00")
    assert result.tot_rate == Decimal("0.07")


def test_wage_tax_within_first_bracket(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("1500.00"), sxm_2026_rates)
    assert result.wage_tax_deduction == Decimal("150.00")
    assert result.szv_assessable_wage == Decimal("1500.00")
    assert result.szv_aov_employer_contribution == Decimal("123.75")
    assert result.szv_aov_employee_deduction == Decimal("71.25")
    assert result.net_take_home_pay == Decimal("1278.75")


def test_wage_tax_spans_brackets(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("3000.00"), sxm_2026_rates)
    assert result.wage_tax_deduction == Decimal("400.00")
    assert result.szv_assessable_wage == Decimal("3000.00")
    assert result.szv_aov_employee_deduction == Decimal("142.50")
    assert result.szv_aov_employer_contribution == Decimal("247.50")
    assert result.net_take_home_pay == Decimal("2457.50")


def test_szv_wage_cap_behavior(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("8000.00"), sxm_2026_rates)
    assert result.szv_assessable_wage == Decimal("5600.00")
    assert result.szv_aov_employer_contribution == Decimal("462.00")
    assert result.szv_aov_employee_deduction == Decimal("266.00")
    assert result.wage_tax_deduction == Decimal("1400.00")
    assert result.net_take_home_pay == Decimal("6334.00")


def test_szv_exactly_at_cap(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("5600.00"), sxm_2026_rates)
    assert result.szv_assessable_wage == Decimal("5600.00")
    assert result.szv_aov_employer_contribution == Decimal("462.00")
    assert result.szv_aov_employee_deduction == Decimal("266.00")


def test_wage_tax_reads_brackets_from_rates(custom_bracket_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("4500.00"), custom_bracket_rates)
    assert result.wage_tax_deduction == Decimal("725.00")


def test_wage_tax_penny_rounding(sxm_2026_rates: TaxRatesSXM) -> None:
    result = calculate_sxm_wage_tax_and_szv(Decimal("1234.56"), sxm_2026_rates)
    assert result.wage_tax_deduction == Decimal("123.46")
    assert result.szv_aov_employee_deduction == Decimal("58.64")
    assert result.szv_aov_employer_contribution == Decimal("101.85")
    assert isinstance(result.net_take_home_pay, Decimal)


def test_all_money_fields_are_decimal(sxm_2026_rates: TaxRatesSXM) -> None:
    tot = calculate_sxm_tot(Decimal("99.99"), sxm_2026_rates)
    wage = calculate_sxm_wage_tax_and_szv(Decimal("2500.00"), sxm_2026_rates)
    for model in (tot, wage):
        for name, value in model.model_dump().items():
            assert isinstance(value, Decimal), f"{name} must be Decimal, got {type(value)}"
