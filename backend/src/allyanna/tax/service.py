"""Load a tax table for the active tenant and run the decimal calculation."""

from decimal import Decimal
from typing import Any

from allyanna.errors import InvalidTaxTable
from allyanna.tax.cache import TaxTableCache
from allyanna.tax.calculate import (
    calculate_monthly_wage_tax,
    calculate_szv,
    calculate_tot,
    calculate_wage_tax,
)
from allyanna.tax.models import MonthlyWageTaxResult, SzvResult, TaxBundle, TotResult, WageTaxResult
from allyanna.tax.repository import TaxRepository
from allyanna.tenancy.service import TenancyService

Connection = Any


class TaxService:
    def __init__(
        self,
        cache: TaxTableCache,
        repository: TaxRepository,
        tenancy: TenancyService,
    ) -> None:
        self._cache = cache
        self._repository = repository
        self._tenancy = tenancy

    async def list_bundles(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
    ) -> list[TaxBundle]:
        schedules = await self._repository.list_schedules(
            conn,
            country_code=country_code,
            tax_year=tax_year,
        )
        bundles: list[TaxBundle] = []
        for schedule in schedules:
            bundles.append(
                await self._cache.get_bundle(
                    conn,
                    country_code=country_code,
                    tax_year=tax_year,
                    schedule_code=schedule.schedule_code,
                )
            )
        return bundles

    async def calculate_tot(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        gross_taxable_revenue: Decimal,
    ) -> tuple[Any, TaxBundle, TotResult]:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        bundle = await self._require_bundle(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            schedule_code="TOT",
            calculation_method="flat_rate",
        )
        if bundle.tot_rate is None:
            raise InvalidTaxTable("TOT schedule is missing its rate row")
        result = calculate_tot(gross_taxable_revenue, bundle.tot_rate)
        await self._audit(
            conn,
            action="tax.tot.calculate",
            detail={
                "schedule_id": str(bundle.schedule.id),
                "tax_year": tax_year,
                "country_code": country_code,
                "gross_taxable_revenue": format(result.gross_taxable_revenue, "f"),
                "rate": format(result.rate, "f"),
                "tot_amount": format(result.tot_amount, "f"),
            },
        )
        return tenant, bundle, result

    async def calculate_wage_tax(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        taxable_wage: Decimal,
    ) -> tuple[Any, TaxBundle, WageTaxResult]:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        bundle = await self._require_bundle(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            schedule_code="WAGE_TAX",
            calculation_method="progressive_step",
        )
        if bundle.schedule.amount_period != "year":
            raise InvalidTaxTable("wage-tax schedule amount_period must be year")
        result = calculate_wage_tax(
            taxable_wage,
            bundle.brackets,
            lower_inclusive=bundle.schedule.lower_inclusive,
            upper_inclusive=bundle.schedule.upper_inclusive,
        )
        bracket = result.bracket
        await self._audit(
            conn,
            action="tax.wage.calculate",
            detail={
                "schedule_id": str(bundle.schedule.id),
                "tax_year": tax_year,
                "country_code": country_code,
                "taxable_wage": format(result.taxable_wage, "f"),
                "tax_amount": format(result.tax_amount, "f"),
                "bracket_order": None if bracket is None else bracket.bracket_order,
            },
        )
        return tenant, bundle, result

    async def calculate_szv(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        gross_monthly_wage: Decimal,
        ov_employer_rate: Decimal | None,
    ) -> tuple[Any, TaxBundle, SzvResult]:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        bundle = await self._require_bundle(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            schedule_code="SZV",
            calculation_method="capped_split",
        )
        if bundle.schedule.amount_period != "month":
            raise InvalidTaxTable("SZV schedule amount_period must be month")
        variable_rate = ov_employer_rate
        variable_source = "request"
        if variable_rate is None and tenant.ov_employer_rate is not None:
            variable_rate = tenant.ov_employer_rate
            variable_source = "tenant_profile"
        result = calculate_szv(
            gross_monthly_wage,
            bundle.components,
            variable_employer_rate=variable_rate,
            variable_rate_source=variable_source,
        )
        await self._audit(
            conn,
            action="tax.szv.calculate",
            detail={
                "schedule_id": str(bundle.schedule.id),
                "tax_year": tax_year,
                "country_code": country_code,
                "gross_monthly_wage": format(result.gross_monthly_wage, "f"),
                "employee_total": format(result.employee_total, "f"),
                "employer_total": format(result.employer_total, "f"),
            },
        )
        return tenant, bundle, result

    async def load_schedule(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        schedule_code: str,
        calculation_method: str,
    ) -> TaxBundle:
        await self._tenancy.require_active_tenant(conn)
        return await self._require_bundle(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            schedule_code=schedule_code,
            calculation_method=calculation_method,
        )

    async def calculate_monthly_wage_tax(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        wage_tax_base: Decimal,
    ) -> tuple[Any, TaxBundle, MonthlyWageTaxResult]:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        bundle = await self._require_bundle(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            schedule_code="WAGE_TAX_MONTHLY",
            calculation_method="wage_class_lookup",
        )
        if bundle.schedule.amount_period != "month":
            raise InvalidTaxTable("monthly wage-tax schedule amount_period must be month")
        if bundle.withholding_rules is None:
            raise InvalidTaxTable("monthly wage-tax schedule is missing withholding rules")
        rules = bundle.withholding_rules
        result = calculate_monthly_wage_tax(
            wage_tax_base,
            bundle.lookup_rows,
            withholding_free_maximum=rules.withholding_free_maximum,
            excess_rate=rules.excess_rate,
        )
        await self._audit(
            conn,
            action="tax.wage_monthly.calculate",
            detail={
                "schedule_id": str(bundle.schedule.id),
                "tax_year": tax_year,
                "country_code": country_code,
                "wage_tax_base": format(result.wage_tax_base, "f"),
                "tax_amount": format(result.tax_amount, "f"),
                "method": result.method,
            },
        )
        return tenant, bundle, result

    async def _require_bundle(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        schedule_code: str,
        calculation_method: str,
    ) -> TaxBundle:
        bundle = await self._cache.get_bundle(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            schedule_code=schedule_code,
        )
        if bundle.schedule.calculation_method != calculation_method:
            raise InvalidTaxTable(f"{schedule_code} schedule uses an unexpected calculation method")
        return bundle

    async def _audit(self, conn: Connection, *, action: str, detail: dict[str, object]) -> None:
        await self._tenancy.write_audit(conn, action=action, detail=detail)
