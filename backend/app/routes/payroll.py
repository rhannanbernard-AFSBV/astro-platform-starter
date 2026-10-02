"""Monthly payroll run route — Decimal tax engine + tenant-scoped INSERT."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.db import get_tenant_db_session
from app.deps import verify_tenant_access_token
from app.schemas import MonthlyPayrollRunRequest, MonthlyPayrollRunResponse
from app.tax_engine import calculate_sxm_wage_tax_and_szv
from app.tax_tables import get_tax_rates

router = APIRouter(prefix="/api/v1/payroll")

_INSERT_PAYROLL = """
    INSERT INTO payroll_records (
        tenant_id, employee_name, payroll_month, gross_salary,
        wage_tax_deduction, szv_employee_deduction,
        szv_employer_contribution, net_pay
    ) VALUES (%s, %s, CURRENT_DATE, %s, %s, %s, %s, %s)
    RETURNING id;
"""


@router.post(
    "/process-monthly-run",
    response_model=MonthlyPayrollRunResponse,
)
async def save_payroll_run(
    payload: MonthlyPayrollRunRequest,
    active_tenant_id: UUID = Depends(verify_tenant_access_token),
) -> MonthlyPayrollRunResponse:
    """
    Execute SXM wage/SZV math via the hardcoded Decimal engine and store the
    payroll row under the authenticated tenant.

    RLS ``app.current_tenant_id`` is set inside ``get_tenant_db_session``
    before the INSERT so ``payroll_records`` isolation cannot be bypassed.
    """
    # 1. Pillar 2 — fetch tax configuration by tax_year + country_code
    rates = get_tax_rates(tax_year=payload.tax_year, country_code="SXM")

    # 2. Hardcoded deterministic calculation (never LLM math)
    calc_results = calculate_sxm_wage_tax_and_szv(payload.gross_salary, rates)

    # 3. Tenant-scoped DB session: SET LOCAL then INSERT (tenant_id explicit)
    async with get_tenant_db_session(active_tenant_id) as conn:
        result = await conn.execute(
            _INSERT_PAYROLL,
            (
                str(active_tenant_id),
                payload.employee_name,
                calc_results.gross_monthly_salary,
                calc_results.wage_tax_deduction,
                calc_results.szv_aov_employee_deduction,
                calc_results.szv_aov_employer_contribution,
                calc_results.net_take_home_pay,
            ),
        )
        row = await result.fetchone()
        if row is None:
            raise RuntimeError("payroll_records INSERT returned no id")
        record_id = row[0]

    return MonthlyPayrollRunResponse(
        status="Success",
        message=(
            f"Payroll calculations securely executed and logged for "
            f"{payload.employee_name}."
        ),
        payroll_record_id=record_id,
        tenant_id=active_tenant_id,
        calculations=calc_results,
    )
