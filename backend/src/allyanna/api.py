"""Async HTTP routes. Every response uses an explicit Pydantic model."""

from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from allyanna.errors import AllyannaError, ServiceUnavailable, Unauthenticated
from allyanna.schemas import (
    ContextResponse,
    ErrorResponse,
    HealthResponse,
    MasterAccountResponse,
    SzvComponentResponse,
    SzvComponentTableResponse,
    SzvGroupResponse,
    SzvRequest,
    SzvResponse,
    InvoiceCreateRequest,
    InvoiceLineResponse,
    InvoiceListResponse,
    InvoiceResponse,
    SwitchContextRequest,
    TaxScheduleResponse,
    TaxSchedulesResponse,
    TenantResponse,
    TotRequest,
    TotResponse,
    WageTaxBracketResponse,
    WageTaxRequest,
    WageTaxResponse,
)
from allyanna.invoices.models import Invoice, InvoiceLineInput
from allyanna.invoices.service import InvoiceService
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
    invoices: InvoiceService


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
        invoices=request.app.state.invoice_service,
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


@router.post("/invoices", response_model=InvoiceResponse, status_code=201)
async def create_invoice(
    body: InvoiceCreateRequest,
    auth: AuthContext = Depends(get_auth),
) -> InvoiceResponse:
    invoice = await auth.invoices.create_invoice(
        auth.conn,
        vendor_name=body.vendor_name,
        invoice_number=body.invoice_number,
        invoice_date=body.invoice_date,
        due_date=body.due_date,
        tax_year=body.tax_year,
        country_code=body.country_code,
        lines=[
            InvoiceLineInput(
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
            )
            for line in body.lines
        ],
    )
    return _invoice_response(invoice)


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(auth: AuthContext = Depends(get_auth)) -> InvoiceListResponse:
    invoices = await auth.invoices.list_invoices(auth.conn)
    tenant_id = invoices[0].tenant_id if invoices else await _active_tenant_id(auth)
    return InvoiceListResponse(
        tenant_id=tenant_id,
        invoices=[_invoice_response(invoice) for invoice in invoices],
    )


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(invoice_id: UUID, auth: AuthContext = Depends(get_auth)) -> InvoiceResponse:
    invoice = await auth.invoices.get_invoice(auth.conn, invoice_id)
    return _invoice_response(invoice)


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


async def _active_tenant_id(auth: AuthContext) -> UUID:
    _tenant, _active = await auth.tenancy.require_active_tenant(auth.conn)
    return _tenant.id


def _invoice_response(invoice: Invoice) -> InvoiceResponse:
    return InvoiceResponse(
        id=invoice.id,
        tenant_id=invoice.tenant_id,
        vendor_name=invoice.vendor_name,
        invoice_number=invoice.invoice_number,
        invoice_date=invoice.invoice_date,
        due_date=invoice.due_date,
        currency_code=invoice.currency_code,
        tax_year=invoice.tax_year,
        country_code=invoice.country_code,
        tax_schedule_id=invoice.tax_schedule_id,
        subtotal=invoice.subtotal,
        tot_rate=invoice.tot_rate,
        tot_amount=invoice.tot_amount,
        grand_total=invoice.grand_total,
        lines=[
            InvoiceLineResponse(
                id=line.id,
                line_number=line.line_number,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                line_total=line.line_total,
            )
            for line in invoice.lines
        ],
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
    )
