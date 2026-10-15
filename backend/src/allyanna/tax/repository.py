"""Load tax schedules by country_code and tax_year.

These tables are jurisdiction reference data. They are not tenant-owned, so the
queries filter on the tax key rather than tenant_id. The service role has
SELECT only.
"""

from typing import Any
from uuid import UUID

from allyanna.money import as_decimal
from allyanna.tax.models import (
    SzvComponent,
    TaxBundle,
    TaxSchedule,
    WageTaxBracket,
    WageTaxLookupRow,
    WageTaxWithholdingRules,
)

Connection = Any


def _schedule_from_row(row: Any) -> TaxSchedule:
    return TaxSchedule(
        id=row["id"],
        country_code=row["country_code"],
        tax_year=row["tax_year"],
        schedule_code=row["schedule_code"],
        calculation_method=row["calculation_method"],
        amount_period=row["amount_period"],
        currency_code=row["currency_code"],
        lower_inclusive=row["lower_inclusive"],
        upper_inclusive=row["upper_inclusive"],
        effective_from=row["effective_from"],
        effective_to=row["effective_to"],
        source_note=row["source_note"],
    )


class TaxRepository:
    async def list_schedules(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
    ) -> list[TaxSchedule]:
        rows = await conn.fetch(
            """
            SELECT id, country_code, tax_year, schedule_code, calculation_method,
                   amount_period, currency_code, lower_inclusive, upper_inclusive,
                   effective_from, effective_to, source_note
            FROM allyanna.tax_schedules
            WHERE country_code = $1 AND tax_year = $2
            ORDER BY schedule_code
            """,
            country_code,
            tax_year,
        )
        return [_schedule_from_row(row) for row in rows]

    async def load_bundle(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        schedule_code: str,
    ) -> TaxBundle | None:
        row = await conn.fetchrow(
            """
            SELECT id, country_code, tax_year, schedule_code, calculation_method,
                   amount_period, currency_code, lower_inclusive, upper_inclusive,
                   effective_from, effective_to, source_note
            FROM allyanna.tax_schedules
            WHERE country_code = $1 AND tax_year = $2 AND schedule_code = $3
            """,
            country_code,
            tax_year,
            schedule_code,
        )
        if row is None:
            return None
        schedule = _schedule_from_row(row)
        return TaxBundle(
            schedule=schedule,
            tot_rate=await self._tot_rate(conn, schedule.id),
            brackets=await self._brackets(conn, schedule.id),
            components=await self._components(conn, schedule.id),
            withholding_rules=await self._withholding_rules(conn, schedule.id),
            lookup_rows=await self._lookup_rows(conn, schedule.id),
        )

    async def _tot_rate(self, conn: Connection, schedule_id: UUID) -> Any:
        row = await conn.fetchrow(
            """
            SELECT rate
            FROM allyanna.tot_rates
            WHERE tax_schedule_id = $1
            """,
            schedule_id,
        )
        if row is None:
            return None
        return as_decimal(row["rate"])

    async def _brackets(self, conn: Connection, schedule_id: UUID) -> tuple[WageTaxBracket, ...]:
        rows = await conn.fetch(
            """
            SELECT bracket_order, income_from, income_to, rate, base_tax
            FROM allyanna.wage_tax_brackets
            WHERE tax_schedule_id = $1
            ORDER BY bracket_order
            """,
            schedule_id,
        )
        return tuple(
            WageTaxBracket(
                bracket_order=row["bracket_order"],
                income_from=as_decimal(row["income_from"]),
                income_to=None if row["income_to"] is None else as_decimal(row["income_to"]),
                rate=as_decimal(row["rate"]),
                base_tax=as_decimal(row["base_tax"]),
            )
            for row in rows
        )

    async def _components(self, conn: Connection, schedule_id: UUID) -> tuple[SzvComponent, ...]:
        rows = await conn.fetch(
            """
            SELECT component_order, component_code, group_code, employee_rate, employer_rate,
                   monthly_wage_ceiling, annual_wage_ceiling, employer_rate_min,
                   employer_rate_max, rate_is_variable, reduces_wage_tax_base
            FROM allyanna.szv_components
            WHERE tax_schedule_id = $1
            ORDER BY component_order
            """,
            schedule_id,
        )
        return tuple(
            SzvComponent(
                component_order=row["component_order"],
                component_code=row["component_code"],
                group_code=row["group_code"],
                employee_rate=as_decimal(row["employee_rate"]),
                employer_rate=as_decimal(row["employer_rate"]),
                monthly_wage_ceiling=as_decimal(row["monthly_wage_ceiling"]),
                annual_wage_ceiling=(
                    None
                    if row["annual_wage_ceiling"] is None
                    else as_decimal(row["annual_wage_ceiling"])
                ),
                employer_rate_min=(
                    None if row["employer_rate_min"] is None else as_decimal(row["employer_rate_min"])
                ),
                employer_rate_max=(
                    None if row["employer_rate_max"] is None else as_decimal(row["employer_rate_max"])
                ),
                rate_is_variable=row["rate_is_variable"],
                reduces_wage_tax_base=row["reduces_wage_tax_base"],
            )
            for row in rows
        )

    async def _withholding_rules(
        self,
        conn: Connection,
        schedule_id: UUID,
    ) -> WageTaxWithholdingRules | None:
        row = await conn.fetchrow(
            """
            SELECT withholding_free_maximum, excess_rate, monthly_acquisition_cost
            FROM allyanna.wage_tax_withholding_rules
            WHERE tax_schedule_id = $1
            """,
            schedule_id,
        )
        if row is None:
            return None
        return WageTaxWithholdingRules(
            withholding_free_maximum=as_decimal(row["withholding_free_maximum"]),
            excess_rate=as_decimal(row["excess_rate"]),
            monthly_acquisition_cost=as_decimal(row["monthly_acquisition_cost"]),
        )

    async def _lookup_rows(self, conn: Connection, schedule_id: UUID) -> tuple[WageTaxLookupRow, ...]:
        rows = await conn.fetch(
            """
            SELECT wage_amount, tax_amount
            FROM allyanna.wage_tax_lookup_rows
            WHERE tax_schedule_id = $1
            ORDER BY wage_amount
            """,
            schedule_id,
        )
        return tuple(
            WageTaxLookupRow(
                wage_amount=as_decimal(row["wage_amount"]),
                tax_amount=as_decimal(row["tax_amount"]),
            )
            for row in rows
        )
