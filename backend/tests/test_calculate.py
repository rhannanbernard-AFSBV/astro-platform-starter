"""Decimal calculations. Rates in these tests are inputs, not formula constants."""

from decimal import Decimal

import pytest

from allyanna.errors import InvalidMoney, InvalidOvRate, InvalidTaxTable
from allyanna.money import as_decimal, money
from allyanna.tax.calculate import (
    calculate_monthly_wage_tax,
    calculate_szv,
    calculate_tot,
    calculate_wage_tax,
)
from allyanna.tax.models import SzvComponent, WageTaxBracket, WageTaxLookupRow

# AB 2026, no. 11 schijventarief, copied here as the expected table contents.
SXM_2026_BRACKETS = (
    WageTaxBracket(1, Decimal("0.00"), Decimal("36576.00"), Decimal("0.125"), Decimal("0.00")),
    WageTaxBracket(2, Decimal("36576.00"), Decimal("54864.00"), Decimal("0.20"), Decimal("4571.95")),
    WageTaxBracket(3, Decimal("54864.00"), Decimal("76200.00"), Decimal("0.2625"), Decimal("8229.49")),
    WageTaxBracket(4, Decimal("76200.00"), Decimal("114297.00"), Decimal("0.3375"), Decimal("13830.02")),
    WageTaxBracket(5, Decimal("114297.00"), Decimal("161540.00"), Decimal("0.40"), Decimal("26688.11")),
    WageTaxBracket(6, Decimal("161540.00"), None, Decimal("0.475"), Decimal("45585.20")),
)


def _component(
    code: str,
    group: str,
    order: int,
    employee: str,
    employer: str,
    monthly: str,
    *,
    annual: str | None = None,
    variable: bool = False,
    minimum: str | None = None,
    maximum: str | None = None,
) -> SzvComponent:
    return SzvComponent(
        component_order=order,
        component_code=code,
        group_code=group,
        employee_rate=Decimal(employee),
        employer_rate=Decimal(employer),
        monthly_wage_ceiling=Decimal(monthly),
        annual_wage_ceiling=None if annual is None else Decimal(annual),
        employer_rate_min=None if minimum is None else Decimal(minimum),
        employer_rate_max=None if maximum is None else Decimal(maximum),
        rate_is_variable=variable,
    )


def test_money_rounds_half_up() -> None:
    assert money(Decimal("1.005")) == Decimal("1.01")
    assert money(Decimal("1.004")) == Decimal("1.00")


def test_float_is_refused() -> None:
    with pytest.raises(InvalidMoney):
        as_decimal(1.25)


def test_tot_uses_the_rate_it_is_given() -> None:
    five = calculate_tot(Decimal("2000.00"), Decimal("0.05"))
    seven = calculate_tot(Decimal("2000.00"), Decimal("0.07"))
    assert five.tot_amount == Decimal("100.00")
    assert seven.tot_amount == Decimal("140.00")


def test_tot_rejects_negative_revenue() -> None:
    with pytest.raises(InvalidMoney):
        calculate_tot(Decimal("-1.00"), Decimal("0.05"))


def test_wage_tax_uses_published_base_tax_not_a_recomputed_running_total() -> None:
    brackets = (
        WageTaxBracket(1, Decimal("0.00"), Decimal("100.00"), Decimal("0.10"), Decimal("0.00")),
        WageTaxBracket(2, Decimal("100.00"), None, Decimal("0.20"), Decimal("9.99")),
    )
    on_boundary = calculate_wage_tax(
        Decimal("100.00"),
        brackets,
        lower_inclusive=False,
        upper_inclusive=True,
    )
    above = calculate_wage_tax(
        Decimal("150.00"),
        brackets,
        lower_inclusive=False,
        upper_inclusive=True,
    )
    assert on_boundary.tax_amount == Decimal("10.00")
    assert on_boundary.bracket is not None
    assert on_boundary.bracket.bracket_order == 1
    assert above.tax_amount == Decimal("19.99")
    assert above.bracket is not None
    assert above.bracket.bracket_order == 2


def test_sxm_2026_schijf_examples() -> None:
    zero = calculate_wage_tax(
        Decimal("0.00"),
        SXM_2026_BRACKETS,
        lower_inclusive=False,
        upper_inclusive=True,
    )
    at_first_cap = calculate_wage_tax(
        Decimal("36576.00"),
        SXM_2026_BRACKETS,
        lower_inclusive=False,
        upper_inclusive=True,
    )
    middle = calculate_wage_tax(
        Decimal("50000.00"),
        SXM_2026_BRACKETS,
        lower_inclusive=False,
        upper_inclusive=True,
    )
    top = calculate_wage_tax(
        Decimal("200000.00"),
        SXM_2026_BRACKETS,
        lower_inclusive=False,
        upper_inclusive=True,
    )
    assert zero.tax_amount == Decimal("0.00")
    assert zero.bracket is None
    assert at_first_cap.tax_amount == Decimal("4572.00")
    assert middle.tax_amount == Decimal("7256.75")
    assert middle.bracket is not None
    assert middle.bracket.bracket_order == 2
    assert top.tax_amount == Decimal("63853.70")
    assert top.bracket is not None
    assert top.bracket.bracket_order == 6


def test_wage_brackets_must_be_contiguous() -> None:
    broken = (
        WageTaxBracket(1, Decimal("0.00"), Decimal("10.00"), Decimal("0.10"), Decimal("0.00")),
        WageTaxBracket(2, Decimal("12.00"), None, Decimal("0.20"), Decimal("1.00")),
    )
    with pytest.raises(InvalidTaxTable):
        calculate_wage_tax(
            Decimal("5.00"),
            broken,
            lower_inclusive=False,
            upper_inclusive=True,
        )


def test_szv_caps_each_component_at_its_monthly_ceiling() -> None:
    components = (
        _component("ZV", "ZV_OV", 1, "0.10", "0.20", "100.00", annual="1.00"),
        _component("AOV", "AOV_AWW", 2, "0.06", "0.07", "150.00", annual="9999.00"),
    )
    result = calculate_szv(Decimal("180.00"), components)
    zv, aov = result.lines
    assert zv.capped_wage == Decimal("100.00")
    assert zv.employee_amount == Decimal("10.00")
    assert zv.employer_amount == Decimal("20.00")
    assert aov.capped_wage == Decimal("150.00")
    assert aov.employee_amount == Decimal("9.00")
    assert result.groups[0].group_code == "ZV_OV"
    assert result.employee_total == Decimal("19.00")


def test_monthly_withholding_reads_the_class_table_and_the_supplied_excess_rate() -> None:
    rows = (
        WageTaxLookupRow(Decimal("10.00"), Decimal("1.00")),
        WageTaxLookupRow(Decimal("20.00"), Decimal("3.00")),
    )
    free = calculate_monthly_wage_tax(
        Decimal("15.00"),
        rows,
        withholding_free_maximum=Decimal("15.00"),
        excess_rate=Decimal("0.10"),
    )
    assert free.method == "free_threshold"
    assert free.tax_amount == Decimal("0.00")
    floored = calculate_monthly_wage_tax(
        Decimal("19.99"),
        rows,
        withholding_free_maximum=Decimal("0.00"),
        excess_rate=Decimal("0.10"),
    )
    assert floored.method == "table"
    assert floored.table_wage_amount == Decimal("10.00")
    assert floored.tax_amount == Decimal("1.00")
    above = calculate_monthly_wage_tax(
        Decimal("24.00"),
        rows,
        withholding_free_maximum=Decimal("0.00"),
        excess_rate=Decimal("0.25"),
    )
    assert above.method == "table_plus_excess"
    assert above.table_tax_amount == Decimal("3.00")
    assert above.excess_wage == Decimal("4.00")
    assert above.tax_amount == Decimal("4.00")
    other_rate = calculate_monthly_wage_tax(
        Decimal("24.00"),
        rows,
        withholding_free_maximum=Decimal("0.00"),
        excess_rate=Decimal("0.10"),
    )
    assert other_rate.tax_amount == Decimal("3.40")
    below = calculate_monthly_wage_tax(
        Decimal("5.00"),
        rows,
        withholding_free_maximum=Decimal("0.00"),
        excess_rate=Decimal("0.10"),
    )
    assert below.method == "below_table"
    assert below.tax_amount == Decimal("0.00")
    with pytest.raises(InvalidTaxTable):
        calculate_monthly_wage_tax(
            Decimal("10.00"),
            (),
            withholding_free_maximum=Decimal("0.00"),
            excess_rate=Decimal("0.10"),
        )


def test_variable_employer_rate_must_stay_inside_the_table_band() -> None:
    components = (
        _component(
            "OV",
            "ZV_OV",
            1,
            "0",
            "0.005",
            "1000.00",
            variable=True,
            minimum="0.005",
            maximum="0.05",
        ),
    )
    allowed = calculate_szv(
        Decimal("1000.00"),
        components,
        variable_employer_rate=Decimal("0.02"),
        variable_rate_source="tenant_profile",
    )
    assert allowed.lines[0].employer_amount == Decimal("20.00")
    assert allowed.lines[0].employer_rate_source == "tenant_profile"
    statutory = calculate_szv(Decimal("1000.00"), components)
    assert statutory.lines[0].employer_rate_source == "statutory_default"
    assert statutory.lines[0].employer_amount == Decimal("5.00")
    with pytest.raises(InvalidOvRate):
        calculate_szv(Decimal("1000.00"), components, variable_employer_rate=Decimal("0.06"))
