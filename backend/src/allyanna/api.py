"""Async HTTP routes. Every response uses an explicit Pydantic model."""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from allyanna.errors import AllyannaError, ServiceUnavailable, Unauthenticated
from allyanna.payroll.models import PayrollLineInput, PayrollRun
from allyanna.payroll.service import PayrollService
from allyanna.schemas import (
    ContextResponse,
    ErrorResponse,
    HealthResponse,
    MasterAccountResponse,
    MonthlyWageTaxRequest,
    MonthlyWageTaxResponse,
    PayrollLineResponse,
    PayrollRunCreateRequest,
    PayrollRunListResponse,
    PayrollRunResponse,
    PayrollSzvLineResponse,
    SzvComponentResponse,
    SzvComponentTableResponse,
    SzvGroupResponse,
    SzvRequest,
    SzvResponse,
    SwitchContextRequest,
    TaxScheduleResponse,
    TaxSchedulesResponse,
    TenantResponse,
    TotRequest,
    TotResponse,
    WageTaxBracketResponse,
    WageTaxLookupSummary,
    WageTaxRequest,
    WageTaxResponse,
)
from allyanna.tax.models import SzvComponent, TaxBundle, WageTaxBracket
from allyanna.tax.service import TaxService
from allyanna.tenancy.models import ContextSnapshot, Membership, Tenant, User
from allyanna.tenancy.service import TenancyService

router = APIRouter()


@dataclass
class AuthContext:
    conn: Any
    user: User
    tenancy: TenancyService
    tax: TaxService
    payroll: PayrollService


async def allyanna_error_handler(_request: Request, exc: AllyannaError) -> JSONResponse:
    body = ErrorResponse(code=exc.code, message=exc.message)
    return JSONResponse(status_code=exc.status_code, content=body.model_dump())


async def db_connection(request: Request) -> Any:
    pool = request.app.state.pool
    if pool is None:
        raise ServiceUnavailable("DATABASE_URL is not configured")
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


async def get_auth(
    request: Request,
    conn: Any = Depends(db_connection),
) -> AuthContext:
    header = request.headers.get("authorization")
    if header is None or not header.startswith("Bearer "):
        raise Unauthenticated("Bearer API key is required")
    raw_key = header.removeprefix("Bearer ").strip()
    if not raw_key:
        raise Unauthenticated("Bearer API key is required")
    tenancy: TenancyService = request.app.state.tenancy_service
    user = await tenancy.authenticate(conn, raw_key)
    return AuthContext(
        conn=conn,
        user=user,
        tenancy=tenancy,
        tax=request.app.state.tax_service,
        payroll=request.app.state.payroll_service,
    )


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="allyanna")


@router.get("/context", response_model=ContextResponse)
async def get_context(auth: AuthContext = Depends(get_auth)) -> ContextResponse:
    snapshot = await auth.tenancy.current_context(auth.conn)
    return _context_response(auth.user, snapshot)


@router.post("/context/switch", response_model=ContextResponse)
async def switch_context(
    body: SwitchContextRequest,
    auth: AuthContext = Depends(get_auth),
) -> ContextResponse:
    snapshot = await auth.tenancy.switch(auth.conn, body.tenant_id)
    return _context_response(auth.user, snapshot)


@router.get("/tax/schedules", response_model=TaxSchedulesResponse)
async def list_tax_schedules(
    tax_year: int = Query(ge=2000, le=2100),
    country_code: str = Query(default="SXM", pattern=r"^[A-Z]{3}$"),
    auth: AuthContext = Depends(get_auth),
) -> TaxSchedulesResponse:
    bundles = await auth.tax.list_bundles(
        auth.conn,
        country_code=country_code,
        tax_year=tax_year,
    )
    return TaxSchedulesResponse(
        country_code=country_code,
        tax_year=tax_year,
        schedules=[_schedule_response(bundle) for bundle in bundles],
    )


@router.post("/tax/tot", response_model=TotResponse)
async def calculate_tot(
    body: TotRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotResponse:
    tenant, bundle, result = await auth.tax.calculate_tot(
        auth.conn,
        country_code=body.country_code,
        tax_year=body.tax_year,
        gross_taxable_revenue=body.gross_taxable_revenue,
    )
    return TotResponse(
        tenant_id=tenant.id,
        tax_year=bundle.schedule.tax_year,
        country_code=bundle.schedule.country_code,
        currency_code=bundle.schedule.currency_code,
        schedule_id=bundle.schedule.id,
        gross_taxable_revenue=result.gross_taxable_revenue,
        rate=result.rate,
        tot_amount=result.tot_amount,
        source_note=bundle.schedule.source_note,
    )


@router.post("/tax/wage", response_model=WageTaxResponse)
async def calculate_wage_tax(
    body: WageTaxRequest,
    auth: AuthContext = Depends(get_auth),
) -> WageTaxResponse:
    tenant, bundle, result = await auth.tax.calculate_wage_tax(
        auth.conn,
        country_code=body.country_code,
        tax_year=body.tax_year,
        taxable_wage=body.taxable_wage,
    )
    applied = None if result.bracket is None else _bracket_response(result.bracket)
    return WageTaxResponse(
        tenant_id=tenant.id,
        tax_year=bundle.schedule.tax_year,
        country_code=bundle.schedule.country_code,
        currency_code=bundle.schedule.currency_code,
        amount_period=bundle.schedule.amount_period,
        schedule_id=bundle.schedule.id,
        taxable_wage=result.taxable_wage,
        tax_amount=result.tax_amount,
        applied_bracket=applied,
        source_note=bundle.schedule.source_note,
    )


@router.post("/tax/szv", response_model=SzvResponse)
async def calculate_szv(
    body: SzvRequest,
    auth: AuthContext = Depends(get_auth),
) -> SzvResponse:
    tenant, bundle, result = await auth.tax.calculate_szv(
        auth.conn,
        country_code=body.country_code,
        tax_year=body.tax_year,
        gross_monthly_wage=body.gross_monthly_wage,
        ov_employer_rate=body.ov_employer_rate,
    )
    stored = {item.component_code: item for item in bundle.components}
    return SzvResponse(
        tenant_id=tenant.id,
        tax_year=bundle.schedule.tax_year,
        country_code=bundle.schedule.country_code,
        currency_code=bundle.schedule.currency_code,
        amount_period=bundle.schedule.amount_period,
        schedule_id=bundle.schedule.id,
        gross_monthly_wage=result.gross_monthly_wage,
        components=[
            _component_response(line, stored[line.component_code])
            for line in result.lines
        ],
        groups=[
            SzvGroupResponse(
                group_code=group.group_code,
                employee_amount=group.employee_amount,
                employer_amount=group.employer_amount,
            )
            for group in result.groups
        ],
        employee_total=result.employee_total,
        employer_total=result.employer_total,
        source_note=bundle.schedule.source_note,
    )


@router.post("/tax/wage-monthly", response_model=MonthlyWageTaxResponse)
async def calculate_monthly_wage_tax(
    body: MonthlyWageTaxRequest,
    auth: AuthContext = Depends(get_auth),
) -> MonthlyWageTaxResponse:
    tenant, bundle, result = await auth.tax.calculate_monthly_wage_tax(
        auth.conn,
        country_code=body.country_code,
        tax_year=body.tax_year,
        wage_tax_base=body.wage_tax_base,
    )
    return MonthlyWageTaxResponse(
        tenant_id=tenant.id,
        tax_year=bundle.schedule.tax_year,
        country_code=bundle.schedule.country_code,
        currency_code=bundle.schedule.currency_code,
        amount_period=bundle.schedule.amount_period,
        schedule_id=bundle.schedule.id,
        wage_tax_base=result.wage_tax_base,
        tax_amount=result.tax_amount,
        method=result.method,
        table_wage_amount=result.table_wage_amount,
        table_tax_amount=result.table_tax_amount,
        excess_wage=result.excess_wage,
        excess_rate=result.excess_rate,
        source_note=bundle.schedule.source_note,
    )


@router.post("/payroll/runs", response_model=PayrollRunResponse, status_code=201)
async def create_payroll_run(
    body: PayrollRunCreateRequest,
    auth: AuthContext = Depends(get_auth),
) -> PayrollRunResponse:
    stored = await auth.payroll.create_run(
        auth.conn,
        period_year=body.period_year,
        period_month=body.period_month,
        ov_employer_rate=body.ov_employer_rate,
        lines=tuple(
            PayrollLineInput(
                employee_name=line.employee_name,
                employee_code=line.employee_code,
                gross_wage=line.gross_wage,
            )
            for line in body.lines
        ),
    )
    return _payroll_response(stored)


@router.get("/payroll/runs", response_model=PayrollRunListResponse)
async def list_payroll_runs(
    auth: AuthContext = Depends(get_auth),
) -> PayrollRunListResponse:
    runs = await auth.payroll.list_runs(auth.conn)
    tenant, _active = await auth.tenancy.require_active_tenant(auth.conn)
    return PayrollRunListResponse(
        tenant_id=tenant.id,
        runs=[_payroll_response(run) for run in runs],
    )


@router.get("/payroll/runs/{run_id}", response_model=PayrollRunResponse)
async def get_payroll_run(
    run_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> PayrollRunResponse:
    stored = await auth.payroll.get_run(auth.conn, run_id)
    return _payroll_response(stored)


def _context_response(user: User, snapshot: ContextSnapshot) -> ContextResponse:
    accounts = [_membership_response(item) for item in snapshot.memberships]
    tenants = [_tenant_response(item) for item in snapshot.tenants]
    active_tenant = None
    active_account = None
    switched_at = None
    if snapshot.active is not None:
        switched_at = snapshot.active.switched_at
        active_tenant = next(
            (item for item in tenants if item.id == snapshot.active.tenant_id),
            None,
        )
        active_account = next(
            (item for item in accounts if item.id == snapshot.active.master_account_id),
            None,
        )
    return ContextResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        master_accounts=accounts,
        active_master_account=active_account,
        active_tenant=active_tenant,
        available_tenants=tenants,
        switched_at=switched_at,
    )


def _membership_response(membership: Membership) -> MasterAccountResponse:
    return MasterAccountResponse(
        id=membership.master_account_id,
        name=membership.name,
        slug=membership.slug,
        role=membership.role,
    )


def _tenant_response(tenant: Tenant) -> TenantResponse:
    return TenantResponse(
        id=tenant.id,
        master_account_id=tenant.master_account_id,
        legal_name=tenant.legal_name,
        trade_name=tenant.trade_name,
        country_code=tenant.country_code,
        crib_number=tenant.crib_number,
        status=tenant.status,
        ov_employer_rate=tenant.ov_employer_rate,
    )


def _bracket_response(bracket: WageTaxBracket) -> WageTaxBracketResponse:
    return WageTaxBracketResponse(
        bracket_order=bracket.bracket_order,
        income_from=bracket.income_from,
        income_to=bracket.income_to,
        rate=bracket.rate,
        base_tax=bracket.base_tax,
    )


def _component_response(line: Any, stored: SzvComponent) -> SzvComponentResponse:
    return SzvComponentResponse(
        component_code=line.component_code,
        group_code=line.group_code,
        monthly_wage_ceiling=line.monthly_wage_ceiling,
        annual_wage_ceiling=stored.annual_wage_ceiling,
        capped_wage=line.capped_wage,
        employee_rate=line.employee_rate,
        employer_rate=line.employer_rate,
        employer_rate_source=line.employer_rate_source,
        employee_amount=line.employee_amount,
        employer_amount=line.employer_amount,
    )


def _schedule_response(bundle: TaxBundle) -> TaxScheduleResponse:
    schedule = bundle.schedule
    return TaxScheduleResponse(
        id=schedule.id,
        country_code=schedule.country_code,
        tax_year=schedule.tax_year,
        schedule_code=schedule.schedule_code,
        calculation_method=schedule.calculation_method,
        amount_period=schedule.amount_period,
        currency_code=schedule.currency_code,
        lower_inclusive=schedule.lower_inclusive,
        upper_inclusive=schedule.upper_inclusive,
        effective_from=schedule.effective_from,
        effective_to=schedule.effective_to,
        source_note=schedule.source_note,
        tot_rate=bundle.tot_rate,
        brackets=[_bracket_response(item) for item in bundle.brackets],
        components=[_stored_component_response(item) for item in bundle.components],
        withholding=_withholding_summary(bundle),
    )


def _stored_component_response(component: SzvComponent) -> SzvComponentTableResponse:
    return SzvComponentTableResponse(
        component_order=component.component_order,
        component_code=component.component_code,
        group_code=component.group_code,
        employee_rate=component.employee_rate,
        employer_rate=component.employer_rate,
        monthly_wage_ceiling=component.monthly_wage_ceiling,
        annual_wage_ceiling=component.annual_wage_ceiling,
        employer_rate_min=component.employer_rate_min,
        employer_rate_max=component.employer_rate_max,
        rate_is_variable=component.rate_is_variable,
        reduces_wage_tax_base=component.reduces_wage_tax_base,
    )


def _withholding_summary(bundle: TaxBundle) -> WageTaxLookupSummary | None:
    rules = bundle.withholding_rules
    if rules is None or not bundle.lookup_rows:
        return None
    first = bundle.lookup_rows[0]
    last = bundle.lookup_rows[-1]
    return WageTaxLookupSummary(
        withholding_free_maximum=rules.withholding_free_maximum,
        excess_rate=rules.excess_rate,
        monthly_acquisition_cost=rules.monthly_acquisition_cost,
        row_count=len(bundle.lookup_rows),
        first_wage_amount=first.wage_amount,
        last_wage_amount=last.wage_amount,
        last_tax_amount=last.tax_amount,
    )


def _payroll_response(run: PayrollRun) -> PayrollRunResponse:
    return PayrollRunResponse(
        id=run.id,
        tenant_id=run.tenant_id,
        period_year=run.period_year,
        period_month=run.period_month,
        country_code=run.country_code,
        currency_code=run.currency_code,
        wage_tax_schedule_id=run.wage_tax_schedule_id,
        szv_schedule_id=run.szv_schedule_id,
        employee_count=run.employee_count,
        gross_wages=run.gross_wages,
        employee_szv_total=run.employee_szv_total,
        employer_szv_total=run.employer_szv_total,
        wage_tax_total=run.wage_tax_total,
        net_wages=run.net_wages,
        created_at=run.created_at,
        lines=[
            PayrollLineResponse(
                id=line.id,
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
                szv_lines=[
                    PayrollSzvLineResponse(
                        component_code=premium.component_code,
                        group_code=premium.group_code,
                        capped_wage=premium.capped_wage,
                        employee_rate=premium.employee_rate,
                        employer_rate=premium.employer_rate,
                        employee_amount=premium.employee_amount,
                        employer_amount=premium.employer_amount,
                    )
                    for premium in line.szv_lines
                ],
            )
            for line in run.lines
        ],
    )
