"""Decimal tax math.

Statutory percentages, ceilings, and bracket amounts are arguments. They are
loaded from tax tables keyed by tax year and country code. This module must
not grow rate literals.
"""

from decimal import Decimal

from allyanna.errors import InvalidOvRate, InvalidTaxTable
from allyanna.money import money, require_money, require_rate
from allyanna.tax.models import (
    MonthlyWageTaxResult,
    SzvComponent,
    SzvGroupTotal,
    SzvLine,
    SzvResult,
    TotResult,
    WageTaxBracket,
    WageTaxLookupRow,
    WageTaxResult,
)


def calculate_tot(gross_taxable_revenue: Decimal, rate: Decimal) -> TotResult:
    """Turnover tax is the flat table rate applied to gross taxable revenue."""
    gross = require_money(gross_taxable_revenue)
    applied_rate = require_rate(rate)
    return TotResult(
        gross_taxable_revenue=gross,
        rate=applied_rate,
        tot_amount=money(gross * applied_rate),
    )


def validate_wage_brackets(
    brackets: tuple[WageTaxBracket, ...] | list[WageTaxBracket],
    *,
    lower_inclusive: bool,
    upper_inclusive: bool,
) -> tuple[WageTaxBracket, ...]:
    if lower_inclusive == upper_inclusive:
        raise InvalidTaxTable("wage-tax bounds must include each shared boundary once")
    ordered = tuple(sorted(brackets, key=lambda item: item.bracket_order))
    if not ordered:
        raise InvalidTaxTable("wage-tax schedule has no brackets")
    expected_orders = tuple(range(1, len(ordered) + 1))
    if tuple(item.bracket_order for item in ordered) != expected_orders:
        raise InvalidTaxTable("wage-tax bracket_order must run from 1 without gaps")
    previous_upper: Decimal | None = None
    for index, bracket in enumerate(ordered):
        require_rate(bracket.rate)
        require_money(bracket.base_tax)
        require_money(bracket.income_from)
        if bracket.income_to is not None:
            require_money(bracket.income_to)
            if bracket.income_to <= bracket.income_from:
                raise InvalidTaxTable("wage-tax upper bound must exceed the lower bound")
        if index == 0:
            if bracket.income_from != 0:
                raise InvalidTaxTable("the first wage-tax bracket must start at 0")
        else:
            if previous_upper is None:
                raise InvalidTaxTable("only the last wage-tax bracket may be open-ended")
            if bracket.income_from != previous_upper:
                raise InvalidTaxTable("wage-tax brackets must meet at each boundary")
        if index == len(ordered) - 1 and bracket.income_to is not None:
            raise InvalidTaxTable("the last wage-tax bracket must be open-ended")
        previous_upper = bracket.income_to
    return ordered


def _bracket_contains(
    amount: Decimal,
    bracket: WageTaxBracket,
    *,
    lower_inclusive: bool,
    upper_inclusive: bool,
) -> bool:
    if lower_inclusive:
        above_lower = amount >= bracket.income_from
    else:
        above_lower = amount > bracket.income_from
    if not above_lower:
        return False
    if bracket.income_to is None:
        return True
    if upper_inclusive:
        return amount <= bracket.income_to
    return amount < bracket.income_to


def calculate_wage_tax(
    taxable_wage: Decimal,
    brackets: tuple[WageTaxBracket, ...] | list[WageTaxBracket],
    *,
    lower_inclusive: bool,
    upper_inclusive: bool,
) -> WageTaxResult:
    """Progressive step tax: published base tax plus the marginal rate on the excess."""
    wage = require_money(taxable_wage)
    ordered = validate_wage_brackets(
        brackets,
        lower_inclusive=lower_inclusive,
        upper_inclusive=upper_inclusive,
    )
    if wage == 0:
        return WageTaxResult(taxable_wage=wage, tax_amount=Decimal("0.00"), bracket=None)
    selected = next(
        (
            bracket
            for bracket in ordered
            if _bracket_contains(
                wage,
                bracket,
                lower_inclusive=lower_inclusive,
                upper_inclusive=upper_inclusive,
            )
        ),
        None,
    )
    if selected is None:
        raise InvalidTaxTable("taxable wage does not fall in a wage-tax bracket")
    excess = wage - selected.income_from
    marginal = money(excess * selected.rate)
    return WageTaxResult(
        taxable_wage=wage,
        tax_amount=money(selected.base_tax + marginal),
        bracket=selected,
    )


def resolve_szv_employer_rate(
    component: SzvComponent,
    variable_employer_rate: Decimal | None,
    variable_rate_source: str,
) -> tuple[Decimal, str]:
    """Pick the employer rate for one component.

    Variable components use the supplied rate when one is present, and otherwise
    the rate stored on the component. The allowed band is that component's min
    and max. Non-variable components always use the stored employer rate.
    """
    if not component.rate_is_variable:
        return component.employer_rate, "table"
    if component.employer_rate_min is None or component.employer_rate_max is None:
        raise InvalidTaxTable("variable SZV component is missing rate bounds")
    if variable_employer_rate is None:
        chosen = component.employer_rate
        source = "statutory_default"
    else:
        chosen = require_rate(variable_employer_rate)
        source = variable_rate_source
    require_rate(chosen)
    if chosen < component.employer_rate_min or chosen > component.employer_rate_max:
        raise InvalidOvRate(
            "OV employer rate must stay inside "
            f"{format(component.employer_rate_min, 'f')} and "
            f"{format(component.employer_rate_max, 'f')}"
        )
    return chosen, source


def calculate_szv(
    gross_monthly_wage: Decimal,
    components: tuple[SzvComponent, ...] | list[SzvComponent],
    variable_employer_rate: Decimal | None = None,
    variable_rate_source: str = "request",
) -> SzvResult:
    """Cap each premium at its monthly wage ceiling, then apply the stored splits."""
    gross = require_money(gross_monthly_wage)
    ordered = tuple(sorted(components, key=lambda item: item.component_order))
    if not ordered:
        raise InvalidTaxTable("SZV schedule has no components")
    variable = [item for item in ordered if item.rate_is_variable]
    if len(variable) > 1:
        raise InvalidTaxTable("SZV schedule has more than one variable-rate component")
    if variable_employer_rate is not None and not variable:
        raise InvalidOvRate("this SZV schedule has no variable employer rate")

    lines: list[SzvLine] = []
    for component in ordered:
        require_rate(component.employee_rate)
        require_rate(component.employer_rate)
        require_money(component.monthly_wage_ceiling)
        employer_rate, source = resolve_szv_employer_rate(
            component,
            variable_employer_rate,
            variable_rate_source,
        )
        if gross <= component.monthly_wage_ceiling:
            capped = gross
        else:
            capped = component.monthly_wage_ceiling
        lines.append(
            SzvLine(
                component_code=component.component_code,
                group_code=component.group_code,
                monthly_wage_ceiling=component.monthly_wage_ceiling,
                capped_wage=capped,
                employee_rate=component.employee_rate,
                employer_rate=employer_rate,
                employer_rate_source=source,
                employee_amount=money(capped * component.employee_rate),
                employer_amount=money(capped * employer_rate),
            )
        )

    grouped: dict[str, list[SzvLine]] = {}
    for line in lines:
        grouped.setdefault(line.group_code, []).append(line)
    groups = tuple(
        SzvGroupTotal(
            group_code=group_code,
            employee_amount=money(sum((line.employee_amount for line in group_lines), Decimal("0"))),
            employer_amount=money(sum((line.employer_amount for line in group_lines), Decimal("0"))),
        )
        for group_code, group_lines in grouped.items()
    )
    return SzvResult(
        gross_monthly_wage=gross,
        lines=tuple(lines),
        groups=groups,
        employee_total=money(sum((line.employee_amount for line in lines), Decimal("0"))),
        employer_total=money(sum((line.employer_amount for line in lines), Decimal("0"))),
    )


def _validate_lookup_rows(
    rows: tuple[WageTaxLookupRow, ...] | list[WageTaxLookupRow],
) -> tuple[WageTaxLookupRow, ...]:
    ordered = tuple(rows)
    if not ordered:
        raise InvalidTaxTable("monthly wage-tax table has no rows")
    previous: Decimal | None = None
    for row in ordered:
        wage_amount = require_money(row.wage_amount)
        require_money(row.tax_amount)
        if previous is not None and wage_amount <= previous:
            raise InvalidTaxTable("monthly wage-tax rows must increase by wage")
        previous = wage_amount
    return ordered


def calculate_monthly_wage_tax(
    wage_tax_base: Decimal,
    rows: tuple[WageTaxLookupRow, ...] | list[WageTaxLookupRow],
    *,
    withholding_free_maximum: Decimal,
    excess_rate: Decimal,
) -> MonthlyWageTaxResult:
    """Withhold from the monthly lookup table.

    At or below the free maximum, the tax is zero. Otherwise use the greatest
    stored wage class that does not exceed the base. Above the last class, add
    the stored excess rate applied to the amount over that class.
    """
    base = require_money(wage_tax_base)
    free_maximum = require_money(withholding_free_maximum)
    applied_rate = require_rate(excess_rate)
    ordered = _validate_lookup_rows(rows)
    if base <= free_maximum:
        return MonthlyWageTaxResult(
            wage_tax_base=base,
            tax_amount=Decimal("0.00"),
            method="free_threshold",
            table_wage_amount=None,
            table_tax_amount=None,
            excess_wage=Decimal("0.00"),
            excess_rate=applied_rate,
        )
    selected: WageTaxLookupRow | None = None
    for row in ordered:
        if row.wage_amount <= base:
            selected = row
        else:
            break
    if selected is None:
        return MonthlyWageTaxResult(
            wage_tax_base=base,
            tax_amount=Decimal("0.00"),
            method="below_table",
            table_wage_amount=None,
            table_tax_amount=None,
            excess_wage=Decimal("0.00"),
            excess_rate=applied_rate,
        )
    last = ordered[-1]
    if base <= last.wage_amount:
        return MonthlyWageTaxResult(
            wage_tax_base=base,
            tax_amount=selected.tax_amount,
            method="table",
            table_wage_amount=selected.wage_amount,
            table_tax_amount=selected.tax_amount,
            excess_wage=Decimal("0.00"),
            excess_rate=applied_rate,
        )
    excess = money(base - last.wage_amount)
    extra = money(excess * applied_rate)
    return MonthlyWageTaxResult(
        wage_tax_base=base,
        tax_amount=money(last.tax_amount + extra),
        method="table_plus_excess",
        table_wage_amount=last.wage_amount,
        table_tax_amount=last.tax_amount,
        excess_wage=excess,
        excess_rate=applied_rate,
    )
