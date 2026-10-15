"""Payroll queries. tenant_id always comes from the transaction-local session."""

from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from allyanna.errors import DuplicatePayrollPeriod
from allyanna.money import as_decimal
from allyanna.payroll.models import PayrollLine, PayrollRun, PayrollSzvLine

Connection = Any


class PayrollRepository:
    async def insert_run(
        self,
        conn: Connection,
        *,
        period_year: int,
        period_month: int,
        country_code: str,
        currency_code: str,
        wage_tax_schedule_id: UUID,
        szv_schedule_id: UUID,
        lines: tuple[PayrollLine, ...],
    ) -> PayrollRun:
        gross_wages = _sum(line.gross_wage for line in lines)
        employee_szv_total = _sum(line.employee_szv_total for line in lines)
        employer_szv_total = _sum(line.employer_szv_total for line in lines)
        wage_tax_total = _sum(line.wage_tax_withheld for line in lines)
        net_wages = _sum(line.net_wage for line in lines)
        try:
            header = await conn.fetchrow(
                """
                INSERT INTO allyanna.payroll_runs (
                  tenant_id, period_year, period_month, country_code, currency_code,
                  wage_tax_schedule_id, szv_schedule_id, employee_count,
                  gross_wages, employee_szv_total, employer_szv_total, wage_tax_total, net_wages
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
                )
                RETURNING id, tenant_id, period_year, period_month, country_code, currency_code,
                          wage_tax_schedule_id, szv_schedule_id, employee_count,
                          gross_wages, employee_szv_total, employer_szv_total, wage_tax_total,
                          net_wages, created_at
                """,
                period_year,
                period_month,
                country_code,
                currency_code,
                wage_tax_schedule_id,
                szv_schedule_id,
                len(lines),
                gross_wages,
                employee_szv_total,
                employer_szv_total,
                wage_tax_total,
                net_wages,
            )
        except asyncpg.UniqueViolationError as exc:
            if getattr(exc, "constraint_name", None) == "payroll_runs_period_unique":
                raise DuplicatePayrollPeriod(
                    "This business already has a payroll run for that month"
                ) from exc
            raise
        stored_lines: list[PayrollLine] = []
        for line in lines:
            row = await conn.fetchrow(
                """
                INSERT INTO allyanna.payroll_lines (
                  tenant_id, payroll_run_id, line_number, employee_name, employee_code,
                  gross_wage, acquisition_cost, aov_aww_employee_deduction, wage_tax_base,
                  wage_tax_withheld, withholding_method, table_wage_amount, table_tax_amount,
                  excess_wage, excess_rate, employee_szv_total, employer_szv_total, net_wage
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
                )
                RETURNING id
                """,
                header["id"],
                line.line_number,
                line.employee_name,
                line.employee_code,
                line.gross_wage,
                line.acquisition_cost,
                line.aov_aww_employee_deduction,
                line.wage_tax_base,
                line.wage_tax_withheld,
                line.withholding_method,
                line.table_wage_amount,
                line.table_tax_amount,
                line.excess_wage,
                line.excess_rate,
                line.employee_szv_total,
                line.employer_szv_total,
                line.net_wage,
            )
            stored_szv: list[PayrollSzvLine] = []
            for premium in line.szv_lines:
                await conn.execute(
                    """
                    INSERT INTO allyanna.payroll_szv_lines (
                      tenant_id, payroll_line_id, component_code, group_code, capped_wage,
                      employee_rate, employer_rate, employee_amount, employer_amount
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      $1, $2, $3, $4, $5, $6, $7, $8
                    )
                    """,
                    row["id"],
                    premium.component_code,
                    premium.group_code,
                    premium.capped_wage,
                    premium.employee_rate,
                    premium.employer_rate,
                    premium.employee_amount,
                    premium.employer_amount,
                )
                stored_szv.append(premium)
            stored_lines.append(
                PayrollLine(
                    id=row["id"],
                    line_number=line.line_number,
                    employee_name=line.employee_name,
                    employee_code=line.employee_code,
                    gross_wage=line.gross_wage,
                    acquisition_cost=line.acquisition_cost,
                    aov_aww_employee_deduction=line.aov_aww_employee_deduction,
                    wage_tax_base=line.wage_tax_base,
                    wage_tax_withheld=line.wage_tax_withheld,
                    withholding_method=line.withholding_method,
                    table_wage_amount=line.table_wage_amount,
                    table_tax_amount=line.table_tax_amount,
                    excess_wage=line.excess_wage,
                    excess_rate=line.excess_rate,
                    employee_szv_total=line.employee_szv_total,
                    employer_szv_total=line.employer_szv_total,
                    net_wage=line.net_wage,
                    szv_lines=tuple(stored_szv),
                )
            )
        return _run_from_row(header, tuple(stored_lines))

    async def list_runs(self, conn: Connection) -> tuple[PayrollRun, ...]:
        headers = await conn.fetch(
            """
            SELECT id, tenant_id, period_year, period_month, country_code, currency_code,
                   wage_tax_schedule_id, szv_schedule_id, employee_count,
                   gross_wages, employee_szv_total, employer_szv_total, wage_tax_total,
                   net_wages, created_at
            FROM allyanna.payroll_runs
            WHERE tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY period_year DESC, period_month DESC, created_at DESC
            """
        )
        return await self._hydrate(conn, headers)

    async def get_run(self, conn: Connection, run_id: UUID) -> PayrollRun | None:
        header = await conn.fetchrow(
            """
            SELECT id, tenant_id, period_year, period_month, country_code, currency_code,
                   wage_tax_schedule_id, szv_schedule_id, employee_count,
                   gross_wages, employee_szv_total, employer_szv_total, wage_tax_total,
                   net_wages, created_at
            FROM allyanna.payroll_runs
            WHERE id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            run_id,
        )
        if header is None:
            return None
        hydrated = await self._hydrate(conn, [header])
        return hydrated[0]

    async def _hydrate(self, conn: Connection, headers: Any) -> tuple[PayrollRun, ...]:
        if not headers:
            return ()
        run_ids = [row["id"] for row in headers]
        line_rows = await conn.fetch(
            """
            SELECT id, payroll_run_id, line_number, employee_name, employee_code,
                   gross_wage, acquisition_cost, aov_aww_employee_deduction, wage_tax_base,
                   wage_tax_withheld, withholding_method, table_wage_amount, table_tax_amount,
                   excess_wage, excess_rate, employee_szv_total, employer_szv_total, net_wage
            FROM allyanna.payroll_lines
            WHERE payroll_run_id = ANY($1::uuid[])
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY line_number
            """,
            run_ids,
        )
        line_ids = [row["id"] for row in line_rows]
        premium_rows = []
        if line_ids:
            premium_rows = await conn.fetch(
                """
                SELECT payroll_line_id, component_code, group_code, capped_wage,
                       employee_rate, employer_rate, employee_amount, employer_amount
                FROM allyanna.payroll_szv_lines
                WHERE payroll_line_id = ANY($1::uuid[])
                  AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
                ORDER BY component_code
                """,
                line_ids,
            )
        premiums_by_line: dict[UUID, list[PayrollSzvLine]] = {}
        for row in premium_rows:
            premiums_by_line.setdefault(row["payroll_line_id"], []).append(_premium_from_row(row))
        lines_by_run: dict[UUID, list[PayrollLine]] = {}
        for row in line_rows:
            lines_by_run.setdefault(row["payroll_run_id"], []).append(
                _line_from_row(row, tuple(premiums_by_line.get(row["id"], [])))
            )
        return tuple(
            _run_from_row(header, tuple(lines_by_run.get(header["id"], [])))
            for header in headers
        )


def _sum(amounts: Any) -> Decimal:
    from allyanna.money import money

    return money(sum(amounts, Decimal("0")))


def _run_from_row(row: Any, lines: tuple[PayrollLine, ...]) -> PayrollRun:
    return PayrollRun(
        id=row["id"],
        tenant_id=row["tenant_id"],
        period_year=row["period_year"],
        period_month=row["period_month"],
        country_code=row["country_code"],
        currency_code=row["currency_code"],
        wage_tax_schedule_id=row["wage_tax_schedule_id"],
        szv_schedule_id=row["szv_schedule_id"],
        employee_count=row["employee_count"],
        gross_wages=as_decimal(row["gross_wages"]),
        employee_szv_total=as_decimal(row["employee_szv_total"]),
        employer_szv_total=as_decimal(row["employer_szv_total"]),
        wage_tax_total=as_decimal(row["wage_tax_total"]),
        net_wages=as_decimal(row["net_wages"]),
        created_at=row["created_at"],
        lines=lines,
    )


def _line_from_row(row: Any, premiums: tuple[PayrollSzvLine, ...]) -> PayrollLine:
    return PayrollLine(
        id=row["id"],
        line_number=row["line_number"],
        employee_name=row["employee_name"],
        employee_code=row["employee_code"],
        gross_wage=as_decimal(row["gross_wage"]),
        acquisition_cost=as_decimal(row["acquisition_cost"]),
        aov_aww_employee_deduction=as_decimal(row["aov_aww_employee_deduction"]),
        wage_tax_base=as_decimal(row["wage_tax_base"]),
        wage_tax_withheld=as_decimal(row["wage_tax_withheld"]),
        withholding_method=row["withholding_method"],
        table_wage_amount=(
            None if row["table_wage_amount"] is None else as_decimal(row["table_wage_amount"])
        ),
        table_tax_amount=(
            None if row["table_tax_amount"] is None else as_decimal(row["table_tax_amount"])
        ),
        excess_wage=as_decimal(row["excess_wage"]),
        excess_rate=as_decimal(row["excess_rate"]),
        employee_szv_total=as_decimal(row["employee_szv_total"]),
        employer_szv_total=as_decimal(row["employer_szv_total"]),
        net_wage=as_decimal(row["net_wage"]),
        szv_lines=premiums,
    )


def _premium_from_row(row: Any) -> PayrollSzvLine:
    return PayrollSzvLine(
        component_code=row["component_code"],
        group_code=row["group_code"],
        capped_wage=as_decimal(row["capped_wage"]),
        employee_rate=as_decimal(row["employee_rate"]),
        employer_rate=as_decimal(row["employer_rate"]),
        employee_amount=as_decimal(row["employee_amount"]),
        employer_amount=as_decimal(row["employer_amount"]),
    )
