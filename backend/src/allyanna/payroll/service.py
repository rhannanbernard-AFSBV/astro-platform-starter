"""Record a monthly payroll run for the active business profile.

Wage-tax withholding uses the monthly lookup table. SZV premiums use the
existing capped-split calculator. The employee AOV/AWW portion that reduces
the loonbelasting grondslag is that same calculator applied to the wage after
the stored monthly acquisition cost, and only for components flagged
reduces_wage_tax_base.
"""

from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from allyanna.errors import InvalidPayroll, InvalidTaxTable, PayrollNotFound
from allyanna.money import money, require_money
from allyanna.payroll.models import PayrollLine, PayrollLineInput, PayrollRun, PayrollSzvLine
from allyanna.payroll.repository import PayrollRepository
from allyanna.tax.calculate import calculate_szv
from allyanna.tax.models import SzvLine, SzvResult, TaxBundle
from allyanna.tax.service import TaxService
from allyanna.tenancy.service import TenancyService

Connection = Any


class PayrollService:
    def __init__(
        self,
        repository: PayrollRepository,
        tax: TaxService,
        tenancy: TenancyService,
    ) -> None:
        self._repository = repository
        self._tax = tax
        self._tenancy = tenancy

    async def create_run(
        self,
        conn: Connection,
        *,
        period_year: int,
        period_month: int,
        ov_employer_rate: Decimal | None,
        lines: tuple[PayrollLineInput, ...],
    ) -> PayrollRun:
        tenant, _active = await self._tenancy.require_active_tenant(conn)
        if not lines:
            raise InvalidPayroll("A payroll run needs at least one employee")
        codes = [line.employee_code for line in lines if line.employee_code is not None]
        if len(codes) != len(set(codes)):
            raise InvalidPayroll("Employee codes must be unique in the payroll run")
        monthly = await self._tax.load_schedule(
            conn,
            country_code=tenant.country_code,
            tax_year=period_year,
            schedule_code="WAGE_TAX_MONTHLY",
            calculation_method="wage_class_lookup",
        )
        if monthly.schedule.amount_period != "month":
            raise InvalidTaxTable("monthly wage-tax schedule amount_period must be month")
        if monthly.withholding_rules is None:
            raise InvalidTaxTable("monthly wage-tax schedule is missing withholding rules")
        allowance = require_money(monthly.withholding_rules.monthly_acquisition_cost)
        priced: list[PayrollLine] = []
        szv_schedule: UUID | None = None
        for index, line in enumerate(lines, start=1):
            gross = require_money(line.gross_wage)
            name = line.employee_name.strip()
            if not name:
                raise InvalidPayroll("Employee name is required")
            code = None if line.employee_code is None else line.employee_code.strip() or None
            acquisition = gross if gross <= allowance else allowance
            premium_wage = money(gross - acquisition)
            _tenant, szv_bundle, remittance = await self._tax.calculate_szv(
                conn,
                country_code=tenant.country_code,
                tax_year=period_year,
                gross_monthly_wage=gross,
                ov_employer_rate=ov_employer_rate,
            )
            if szv_bundle.schedule.currency_code != monthly.schedule.currency_code:
                raise InvalidTaxTable("wage-tax and SZV schedules use different currencies")
            if szv_schedule is None:
                szv_schedule = szv_bundle.schedule.id
            elif szv_schedule != szv_bundle.schedule.id:
                raise InvalidTaxTable("SZV schedule changed during the run")
            deduction = _wage_tax_deduction(premium_wage, szv_bundle, remittance)
            if deduction > premium_wage:
                raise InvalidTaxTable("wage-tax deduction exceeds the wage after acquisition cost")
            wage_tax_base = money(premium_wage - deduction)
            _tenant, monthly_bundle, withheld = await self._tax.calculate_monthly_wage_tax(
                conn,
                country_code=tenant.country_code,
                tax_year=period_year,
                wage_tax_base=wage_tax_base,
            )
            if monthly_bundle.schedule.id != monthly.schedule.id:
                raise InvalidTaxTable("monthly wage-tax schedule changed during the run")
            net = money(gross - remittance.employee_total - withheld.tax_amount)
            if net < 0:
                raise InvalidPayroll("Employee deductions exceed gross wage")
            priced.append(
                PayrollLine(
                    id=uuid4(),
                    line_number=index,
                    employee_name=name,
                    employee_code=code,
                    gross_wage=gross,
                    acquisition_cost=acquisition,
                    aov_aww_employee_deduction=deduction,
                    wage_tax_base=wage_tax_base,
                    wage_tax_withheld=withheld.tax_amount,
                    withholding_method=withheld.method,
                    table_wage_amount=withheld.table_wage_amount,
                    table_tax_amount=withheld.table_tax_amount,
                    excess_wage=withheld.excess_wage,
                    excess_rate=withheld.excess_rate,
                    employee_szv_total=remittance.employee_total,
                    employer_szv_total=remittance.employer_total,
                    net_wage=net,
                    szv_lines=tuple(_premium(item) for item in remittance.lines),
                )
            )
        if szv_schedule is None:
            raise InvalidPayroll("A payroll run needs at least one employee")
        stored = await self._repository.insert_run(
            conn,
            period_year=period_year,
            period_month=period_month,
            country_code=tenant.country_code,
            currency_code=monthly.schedule.currency_code,
            wage_tax_schedule_id=monthly.schedule.id,
            szv_schedule_id=szv_schedule,
            lines=tuple(priced),
        )
        await self._tenancy.write_audit(
            conn,
            action="payroll.record",
            detail={
                "payroll_run_id": str(stored.id),
                "period_year": period_year,
                "period_month": period_month,
                "employee_count": stored.employee_count,
                "gross_wages": format(stored.gross_wages, "f"),
                "wage_tax_total": format(stored.wage_tax_total, "f"),
                "employee_szv_total": format(stored.employee_szv_total, "f"),
                "employer_szv_total": format(stored.employer_szv_total, "f"),
            },
        )
        return stored

    async def list_runs(self, conn: Connection) -> tuple[PayrollRun, ...]:
        await self._tenancy.require_active_tenant(conn)
        return await self._repository.list_runs(conn)

    async def get_run(self, conn: Connection, run_id: Any) -> PayrollRun:
        await self._tenancy.require_active_tenant(conn)
        found = await self._repository.get_run(conn, run_id)
        if found is None:
            raise PayrollNotFound("Payroll run was not found for the active business")
        return found


def _wage_tax_deduction(premium_wage: Decimal, bundle: TaxBundle, remittance: SzvResult) -> Decimal:
    flagged = {item.component_code for item in bundle.components if item.reduces_wage_tax_base}
    if not flagged:
        raise InvalidTaxTable("SZV schedule does not mark a wage-tax deduction")
    variable = next(
        (line for line in remittance.lines if line.employer_rate_source != "table"),
        None,
    )
    if variable is None:
        deducted = calculate_szv(premium_wage, bundle.components)
    else:
        deducted = calculate_szv(
            premium_wage,
            bundle.components,
            variable_employer_rate=variable.employer_rate,
            variable_rate_source=variable.employer_rate_source,
        )
    return money(
        sum(
            (line.employee_amount for line in deducted.lines if line.component_code in flagged),
            Decimal("0"),
        )
    )


def _premium(line: SzvLine) -> PayrollSzvLine:
    return PayrollSzvLine(
        component_code=line.component_code,
        group_code=line.group_code,
        capped_wage=line.capped_wage,
        employee_rate=line.employee_rate,
        employer_rate=line.employer_rate,
        employee_amount=line.employee_amount,
        employer_amount=line.employer_amount,
    )
