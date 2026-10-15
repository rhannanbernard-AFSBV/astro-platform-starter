"""Async HTTP routes. Every response uses an explicit Pydantic model."""

from dataclasses import dataclass
from datetime import date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, Request, UploadFile
from fastapi.responses import JSONResponse

from allyanna.config import KNOWN_DEMO_API_KEYS, get_settings
from allyanna.errors import AllyannaError, ServiceUnavailable, Unauthenticated
from allyanna.ocr.models import DocumentIntake
from allyanna.ocr.service import DocumentIntakeService
from allyanna.payroll.models import PayrollLineInput, PayrollRun
from allyanna.payroll.service import PayrollService
from allyanna.readiness.models import (
    IntakeReview,
    IntakeReviewList,
    TotPeriodReadiness,
    UnfiledInvoice,
)
from allyanna.readiness.service import TotPeriodReadinessService
from allyanna.schemas import (
    ContextResponse,
    DocumentIntakeListResponse,
    DocumentIntakeResponse,
    DocumentLineResponse,
    ErrorResponse,
    HealthResponse,
    IntakeReviewListResponse,
    IntakeReviewResponse,
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
    TotWorksheetInvoiceResponse,
    TotAmendmentRequest,
    TotBalanceListResponse,
    TotPaymentItem,
    TotPaymentListResponse,
    TotPaymentRequest,
    TotPaymentResponse,
    TotPeriodReadinessResponse,
    TotRefundItem,
    TotRefundListResponse,
    TotRefundRequest,
    TotRefundResponse,
    TotAnnualSummaryAmendmentRequest,
    TotAnnualSummaryListResponse,
    TotAnnualSummaryRequest,
    TotAnnualSummaryResponse,
    TotAnnualSummaryDueActionsResponse,
    TotAnnualSummaryDueListResponse,
    TotAnnualSummaryDueResponse,
    TotAnnualSummaryGapResponse,
    TotDueOpenReturnResponse,
    TotAnnualSummaryStatementResponse,
    TotAnnualSummaryUnfiledRequest,
    TotAnnualSummaryVersionResponse,
    TotStatementLineResponse,
    TotStatementResponse,
    TotYearFilingResponse,
    TotYearStatementResponse,
    TotReturnBalanceResponse,
    UnfiledInvoiceResponse,
    TotReturnFileRequest,
    TotReturnListResponse,
    TotReturnResponse,
    TotWorksheetRequest,
    TotWorksheetResponse,
    WageTaxBracketResponse,
    WageTaxLookupSummary,
    WageTaxRequest,
    WageTaxResponse,
)
from allyanna.invoices.models import Invoice, InvoiceLineInput
from allyanna.invoices.service import InvoiceService
from allyanna.tax.models import SzvComponent, TaxBundle, WageTaxBracket
from allyanna.tax.service import TaxService
from allyanna.tenancy.models import ContextSnapshot, Membership, Tenant, User
from allyanna.tenancy.service import TenancyService
from allyanna.worksheets.models import (
    TotAnnualSummary,
    TotAnnualSummaryList,
    TotAnnualSummaryDue,
    TotAnnualSummaryDueActions,
    TotAnnualSummaryDueList,
    TotAnnualSummaryGap,
    TotAnnualSummaryStatement,
    TotAnnualSummaryVersion,
    TotDueOpenReturn,
    TotBalanceList,
    TotPayment,
    TotPaymentList,
    TotPaymentView,
    TotRefund,
    TotRefundList,
    TotRefundView,
    TotReturn,
    TotStatement,
    TotStatementLine,
    TotYearFiling,
    TotYearStatement,
    TotReturnBalance,
    TotWorksheet,
)
from allyanna.worksheets.service import TotWorksheetService

router = APIRouter()


@dataclass
class AuthContext:
    conn: Any
    user: User
    tenancy: TenancyService
    tax: TaxService
    documents: DocumentIntakeService
    invoices: InvoiceService
    worksheets: TotWorksheetService
    payroll: PayrollService
    readiness: TotPeriodReadinessService


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
    settings = get_settings()
    if raw_key in KNOWN_DEMO_API_KEYS and not settings.demo_keys_allowed():
        raise Unauthenticated("Demo API keys are disabled in this environment")
    tenancy: TenancyService = request.app.state.tenancy_service
    user = await tenancy.authenticate(conn, raw_key)
    return AuthContext(
        conn=conn,
        user=user,
        tenancy=tenancy,
        tax=request.app.state.tax_service,
        documents=request.app.state.document_intake_service,
        invoices=request.app.state.invoice_service,
        worksheets=request.app.state.worksheet_service,
        payroll=request.app.state.payroll_service,
        readiness=request.app.state.readiness_service,
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


@router.post("/tax/tot/worksheet", response_model=TotWorksheetResponse)
async def turnover_tax_worksheet(
    body: TotWorksheetRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotWorksheetResponse:
    worksheet = await auth.worksheets.build(
        auth.conn,
        period_start=body.period_start,
        period_end=body.period_end,
        tax_year=body.tax_year,
        country_code=body.country_code,
    )
    return _worksheet_response(worksheet)


@router.post("/tax/tot/returns", response_model=TotReturnResponse, status_code=201)
async def file_turnover_tax_return(
    body: TotReturnFileRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotReturnResponse:
    filed = await auth.worksheets.file_return(
        auth.conn,
        period_start=body.period_start,
        period_end=body.period_end,
        tax_year=body.tax_year,
        country_code=body.country_code,
        due_on=body.due_on,
    )
    return _return_response(filed)


@router.get("/tax/tot/returns", response_model=TotReturnListResponse)
async def list_turnover_tax_returns(
    auth: AuthContext = Depends(get_auth),
) -> TotReturnListResponse:
    tenant_id, filings = await auth.worksheets.list_returns(auth.conn)
    return TotReturnListResponse(
        tenant_id=tenant_id,
        returns=[_return_response(item) for item in filings],
    )


@router.get("/tax/tot/returns/{return_id}", response_model=TotReturnResponse)
async def get_turnover_tax_return(
    return_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotReturnResponse:
    filed = await auth.worksheets.get_return(auth.conn, return_id)
    return _return_response(filed)


@router.post(
    "/tax/tot/returns/{return_id}/amendments",
    response_model=TotReturnResponse,
    status_code=201,
)
async def amend_turnover_tax_return(
    return_id: UUID,
    body: TotAmendmentRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotReturnResponse:
    amended = await auth.worksheets.amend_return(
        auth.conn,
        return_id=return_id,
        due_on=body.due_on,
    )
    return _return_response(amended)


@router.post(
    "/tax/tot/returns/{return_id}/payments",
    response_model=TotPaymentResponse,
    status_code=201,
)
async def record_turnover_tax_payment(
    return_id: UUID,
    body: TotPaymentRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotPaymentResponse:
    recorded = await auth.worksheets.record_payment(
        auth.conn,
        return_id=return_id,
        amount=body.amount,
        paid_on=body.paid_on,
    )
    return _payment_response(recorded)


@router.get(
    "/tax/tot/returns/{return_id}/payments",
    response_model=TotPaymentListResponse,
)
async def list_turnover_tax_payments(
    return_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotPaymentListResponse:
    listing = await auth.worksheets.list_payments(auth.conn, return_id)
    return _payment_list_response(listing)


@router.get("/tax/tot/payments/{payment_id}", response_model=TotPaymentResponse)
async def get_turnover_tax_payment(
    payment_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotPaymentResponse:
    recorded = await auth.worksheets.get_payment(auth.conn, payment_id)
    return _payment_response(recorded)


@router.post(
    "/tax/tot/returns/{return_id}/refunds",
    response_model=TotRefundResponse,
    status_code=201,
)
async def record_turnover_tax_refund(
    return_id: UUID,
    body: TotRefundRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotRefundResponse:
    recorded = await auth.worksheets.record_refund(
        auth.conn,
        return_id=return_id,
        amount=body.amount,
        refunded_on=body.refunded_on,
    )
    return _refund_response(recorded)


@router.get(
    "/tax/tot/returns/{return_id}/refunds",
    response_model=TotRefundListResponse,
)
async def list_turnover_tax_refunds(
    return_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotRefundListResponse:
    listing = await auth.worksheets.list_refunds(auth.conn, return_id)
    return _refund_list_response(listing)


@router.get("/tax/tot/refunds/{refund_id}", response_model=TotRefundResponse)
async def get_turnover_tax_refund(
    refund_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotRefundResponse:
    recorded = await auth.worksheets.get_refund(auth.conn, refund_id)
    return _refund_response(recorded)


@router.get(
    "/tax/tot/returns/{return_id}/statement",
    response_model=TotStatementResponse,
)
async def get_turnover_tax_statement(
    return_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotStatementResponse:
    statement = await auth.worksheets.get_statement(auth.conn, return_id)
    return _statement_response(statement)


@router.get("/tax/tot/statements", response_model=TotYearStatementResponse)
async def get_turnover_tax_year_statement(
    tax_year: int = Query(ge=2000, le=2100),
    country_code: str = Query(default="SXM", pattern=r"^[A-Z]{3}$"),
    auth: AuthContext = Depends(get_auth),
) -> TotYearStatementResponse:
    statement = await auth.worksheets.get_year_statement(
        auth.conn,
        tax_year=tax_year,
        country_code=country_code,
    )
    return _year_statement_response(statement)


@router.post("/tax/tot/summaries", response_model=TotAnnualSummaryResponse, status_code=201)
async def file_turnover_tax_annual_summary(
    body: TotAnnualSummaryRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotAnnualSummaryResponse:
    recorded = await auth.worksheets.file_annual_summary(
        auth.conn,
        tax_year=body.tax_year,
        country_code=body.country_code,
    )
    return _annual_summary_response(recorded)


@router.get("/tax/tot/summaries", response_model=TotAnnualSummaryListResponse)
async def list_turnover_tax_annual_summaries(
    auth: AuthContext = Depends(get_auth),
) -> TotAnnualSummaryListResponse:
    listing = await auth.worksheets.list_annual_summaries(auth.conn)
    return _annual_summary_list_response(listing)


@router.post(
    "/tax/tot/summaries/{summary_id}/amendments",
    response_model=TotAnnualSummaryResponse,
    status_code=201,
)
async def amend_turnover_tax_annual_summary(
    summary_id: UUID,
    body: TotAnnualSummaryAmendmentRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotAnnualSummaryResponse:
    _ = body
    recorded = await auth.worksheets.amend_annual_summary(auth.conn, summary_id)
    return _annual_summary_response(recorded)


@router.get(
    "/tax/tot/summaries/{summary_id}/statement",
    response_model=TotAnnualSummaryStatementResponse,
)
async def get_turnover_tax_annual_summary_statement(
    summary_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotAnnualSummaryStatementResponse:
    statement = await auth.worksheets.get_annual_summary_statement(auth.conn, summary_id)
    return _annual_summary_statement_response(statement)


@router.get("/tax/tot/dues", response_model=TotAnnualSummaryDueListResponse)
async def list_turnover_tax_annual_summary_dues(
    auth: AuthContext = Depends(get_auth),
) -> TotAnnualSummaryDueListResponse:
    listing = await auth.worksheets.list_annual_summary_dues(auth.conn)
    return _annual_summary_due_list_response(listing)


@router.get("/tax/tot/period-ready", response_model=TotPeriodReadinessResponse)
async def get_turnover_tax_period_readiness(
    tax_year: int = Query(ge=2000, le=2100),
    country_code: str = Query(default="SXM", pattern=r"^[A-Z]{3}$"),
    as_of: date | None = Query(default=None),
    auth: AuthContext = Depends(get_auth),
) -> TotPeriodReadinessResponse:
    readiness = await auth.readiness.get_period_readiness(
        auth.conn,
        tax_year=tax_year,
        country_code=country_code,
        as_of=as_of,
    )
    return _period_readiness_response(readiness)


@router.get(
    "/tax/tot/summaries/{summary_id}/due",
    response_model=TotAnnualSummaryDueResponse,
)
async def get_turnover_tax_annual_summary_due(
    summary_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotAnnualSummaryDueResponse:
    reminder = await auth.worksheets.get_annual_summary_due(auth.conn, summary_id)
    return _annual_summary_due_response(reminder)


@router.post(
    "/tax/tot/summaries/{summary_id}/unfiled",
    response_model=TotAnnualSummaryResponse,
    status_code=201,
)
async def file_turnover_tax_annual_summary_unfiled(
    summary_id: UUID,
    body: TotAnnualSummaryUnfiledRequest,
    auth: AuthContext = Depends(get_auth),
) -> TotAnnualSummaryResponse:
    _ = body
    recorded = await auth.worksheets.file_unfiled_annual_summary(auth.conn, summary_id)
    return _annual_summary_response(recorded)


@router.get("/tax/tot/summaries/{summary_id}", response_model=TotAnnualSummaryResponse)
async def get_turnover_tax_annual_summary(
    summary_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> TotAnnualSummaryResponse:
    recorded = await auth.worksheets.get_annual_summary(auth.conn, summary_id)
    return _annual_summary_response(recorded)


@router.get("/tax/tot/balances", response_model=TotBalanceListResponse)
async def list_turnover_tax_balances(
    as_of: date | None = Query(default=None),
    auth: AuthContext = Depends(get_auth),
) -> TotBalanceListResponse:
    listing = await auth.worksheets.list_balances(
        auth.conn,
        as_of=date.today() if as_of is None else as_of,
    )
    return _balance_list_response(listing)


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


@router.post("/documents", response_model=DocumentIntakeResponse, status_code=202)
async def create_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    auth: AuthContext = Depends(get_auth),
) -> DocumentIntakeResponse:
    content = await file.read()
    stored = await auth.documents.submit(
        auth.conn,
        user_id=auth.user.id,
        filename=file.filename or "upload",
        content_type=file.content_type or "",
        content=content,
    )
    background.add_task(auth.documents.process, stored.id, auth.user.id, stored.tenant_id)
    return _document_response(stored)


@router.get("/documents", response_model=DocumentIntakeListResponse)
async def list_documents(auth: AuthContext = Depends(get_auth)) -> DocumentIntakeListResponse:
    documents = await auth.documents.list_documents(auth.conn)
    tenant, _active = await auth.tenancy.require_active_tenant(auth.conn)
    return DocumentIntakeListResponse(
        tenant_id=tenant.id,
        documents=[_document_response(item) for item in documents],
    )


@router.get("/documents/review", response_model=IntakeReviewListResponse)
async def list_document_reviews(
    auth: AuthContext = Depends(get_auth),
) -> IntakeReviewListResponse:
    listing = await auth.readiness.list_intake_reviews(auth.conn)
    return _intake_review_list_response(listing)


@router.get("/documents/{document_id}/review", response_model=IntakeReviewResponse)
async def get_document_review(
    document_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> IntakeReviewResponse:
    review = await auth.readiness.get_intake_review(auth.conn, document_id)
    return _intake_review_response(review)


@router.get("/documents/{document_id}", response_model=DocumentIntakeResponse)
async def get_document(
    document_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> DocumentIntakeResponse:
    stored = await auth.documents.get_document(auth.conn, document_id)
    return _document_response(stored)


@router.post("/documents/{document_id}/invoice", response_model=InvoiceResponse, status_code=201)
async def post_document_invoice(
    document_id: UUID,
    auth: AuthContext = Depends(get_auth),
) -> InvoiceResponse:
    invoice = await auth.invoices.post_intake(auth.conn, document_id)
    return _invoice_response(invoice)


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
        corrects_return_id=body.corrects_return_id,
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
        document_intake_id=invoice.document_intake_id,
        corrects_return_id=invoice.corrects_return_id,
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


def _worksheet_response(worksheet: TotWorksheet) -> TotWorksheetResponse:
    return TotWorksheetResponse(
        tenant_id=worksheet.tenant_id,
        period_start=worksheet.period_start,
        period_end=worksheet.period_end,
        tax_year=worksheet.tax_year,
        country_code=worksheet.country_code,
        currency_code=worksheet.currency_code,
        schedule_id=worksheet.schedule_id,
        rate=worksheet.rate,
        invoice_count=worksheet.invoice_count,
        subtotal=worksheet.subtotal,
        tot_amount=worksheet.tot_amount,
        grand_total=worksheet.grand_total,
        invoices=[
            TotWorksheetInvoiceResponse(
                id=row.id,
                vendor_name=row.vendor_name,
                invoice_date=row.invoice_date,
                subtotal=row.subtotal,
                tot_rate=row.tot_rate,
                tot_amount=row.tot_amount,
                grand_total=row.grand_total,
            )
            for row in worksheet.invoices
        ],
    )


def _payment_item(payment: TotPayment) -> TotPaymentItem:
    return TotPaymentItem(
        id=payment.id,
        tenant_id=payment.tenant_id,
        tot_return_id=payment.tot_return_id,
        amount=payment.amount,
        paid_on=payment.paid_on,
        recorded_at=payment.recorded_at,
    )


def _payment_response(view: TotPaymentView) -> TotPaymentResponse:
    item = _payment_item(view.payment)
    return TotPaymentResponse(
        id=item.id,
        tenant_id=item.tenant_id,
        tot_return_id=item.tot_return_id,
        amount=item.amount,
        paid_on=item.paid_on,
        recorded_at=item.recorded_at,
        tax_due=view.tax_due,
        amount_paid=view.amount_paid,
        balance_due=view.balance_due,
    )


def _balance_item(row: TotReturnBalance) -> TotReturnBalanceResponse:
    return TotReturnBalanceResponse(
        return_id=row.return_id,
        tenant_id=row.tenant_id,
        country_code=row.country_code,
        tax_year=row.tax_year,
        period_start=row.period_start,
        period_end=row.period_end,
        currency_code=row.currency_code,
        due_on=row.due_on,
        tax_due=row.tax_due,
        amount_paid=row.amount_paid,
        balance_due=row.balance_due,
        past_due=row.past_due,
    )


def _balance_list_response(listing: TotBalanceList) -> TotBalanceListResponse:
    return TotBalanceListResponse(
        tenant_id=listing.tenant_id,
        as_of=listing.as_of,
        tax_due=listing.tax_due,
        amount_paid=listing.amount_paid,
        balance_due=listing.balance_due,
        past_due_balance=listing.past_due_balance,
        returns=[_balance_item(row) for row in listing.returns],
    )


def _refund_item(refund: TotRefund) -> TotRefundItem:
    return TotRefundItem(
        id=refund.id,
        tenant_id=refund.tenant_id,
        tot_return_id=refund.tot_return_id,
        amount=refund.amount,
        refunded_on=refund.refunded_on,
        recorded_at=refund.recorded_at,
    )


def _refund_response(view: TotRefundView) -> TotRefundResponse:
    item = _refund_item(view.refund)
    return TotRefundResponse(
        id=item.id,
        tenant_id=item.tenant_id,
        tot_return_id=item.tot_return_id,
        amount=item.amount,
        refunded_on=item.refunded_on,
        recorded_at=item.recorded_at,
        tax_due=view.tax_due,
        amount_paid=view.amount_paid,
        balance_due=view.balance_due,
    )


def _statement_line(line: TotStatementLine) -> TotStatementLineResponse:
    return TotStatementLineResponse(
        kind=line.kind,
        id=line.id,
        tot_return_id=line.tot_return_id,
        amount=line.amount,
        entry_date=line.entry_date,
        recorded_at=line.recorded_at,
        balance=line.balance,
    )


def _year_filing(filing: TotYearFiling) -> TotYearFilingResponse:
    return TotYearFilingResponse(
        return_id=filing.return_id,
        period_start=filing.period_start,
        period_end=filing.period_end,
        tax_due=filing.tax_due,
        amount_paid=filing.amount_paid,
        balance_due=filing.balance_due,
        opening_balance=filing.opening_balance,
        closing_balance=filing.closing_balance,
        lines=[_statement_line(line) for line in filing.lines],
    )


def _annual_summary_response(summary: TotAnnualSummary) -> TotAnnualSummaryResponse:
    return TotAnnualSummaryResponse(
        id=summary.id,
        tenant_id=summary.tenant_id,
        country_code=summary.country_code,
        tax_year=summary.tax_year,
        currency_code=summary.currency_code,
        filing_count=summary.filing_count,
        tax_due=summary.tax_due,
        amount_paid=summary.amount_paid,
        balance_due=summary.balance_due,
        amends_summary_id=summary.amends_summary_id,
        superseded=summary.superseded,
        filed_at=summary.filed_at,
    )


def _annual_summary_version(version: TotAnnualSummaryVersion) -> TotAnnualSummaryVersionResponse:
    return TotAnnualSummaryVersionResponse(
        summary_id=version.summary_id,
        amends_summary_id=version.amends_summary_id,
        superseded=version.superseded,
        filing_count=version.filing_count,
        tax_due=version.tax_due,
        amount_paid=version.amount_paid,
        balance_due=version.balance_due,
        tax_change=version.tax_change,
        amount_paid_change=version.amount_paid_change,
        balance_change=version.balance_change,
        filed_at=version.filed_at,
    )


def _annual_summary_gap(gap: TotAnnualSummaryGap) -> TotAnnualSummaryGapResponse:
    return TotAnnualSummaryGapResponse(
        tax_due=gap.tax_due,
        amount_paid=gap.amount_paid,
        balance_due=gap.balance_due,
        filing_count=gap.filing_count,
        tax_change=gap.tax_change,
        amount_paid_change=gap.amount_paid_change,
        balance_change=gap.balance_change,
    )


def _annual_summary_statement_response(
    statement: TotAnnualSummaryStatement,
) -> TotAnnualSummaryStatementResponse:
    return TotAnnualSummaryStatementResponse(
        tenant_id=statement.tenant_id,
        country_code=statement.country_code,
        tax_year=statement.tax_year,
        currency_code=statement.currency_code,
        tax_due=statement.tax_due,
        amount_paid=statement.amount_paid,
        balance_due=statement.balance_due,
        versions=[_annual_summary_version(version) for version in statement.versions],
        unfiled=_annual_summary_gap(statement.unfiled),
    )


def _due_open_return_response(row: TotDueOpenReturn) -> TotDueOpenReturnResponse:
    return TotDueOpenReturnResponse(
        return_id=row.return_id,
        period_start=row.period_start,
        period_end=row.period_end,
        currency_code=row.currency_code,
        due_on=row.due_on,
        tax_due=row.tax_due,
        amount_paid=row.amount_paid,
        balance_due=row.balance_due,
        past_due=row.past_due,
        payment_path=row.payment_path,
    )


def _annual_summary_due_actions(
    actions: TotAnnualSummaryDueActions,
) -> TotAnnualSummaryDueActionsResponse:
    return TotAnnualSummaryDueActionsResponse(
        can_file_unfiled=actions.can_file_unfiled,
        file_unfiled_path=actions.file_unfiled_path,
        year_statement_path=actions.year_statement_path,
        open_returns=[_due_open_return_response(row) for row in actions.open_returns],
    )


def _annual_summary_due_response(reminder: TotAnnualSummaryDue) -> TotAnnualSummaryDueResponse:
    return TotAnnualSummaryDueResponse(
        tenant_id=reminder.tenant_id,
        country_code=reminder.country_code,
        tax_year=reminder.tax_year,
        currency_code=reminder.currency_code,
        summary_id=reminder.summary_id,
        filed_tax_due=reminder.filed_tax_due,
        filed_amount_paid=reminder.filed_amount_paid,
        filed_balance_due=reminder.filed_balance_due,
        amount_due=reminder.amount_due,
        has_unfiled_gap=reminder.has_unfiled_gap,
        unfiled=_annual_summary_gap(reminder.unfiled),
        actions=_annual_summary_due_actions(reminder.actions),
    )


def _annual_summary_due_list_response(
    listing: TotAnnualSummaryDueList,
) -> TotAnnualSummaryDueListResponse:
    return TotAnnualSummaryDueListResponse(
        tenant_id=listing.tenant_id,
        amount_due=listing.amount_due,
        unfiled_count=listing.unfiled_count,
        dues=[_annual_summary_due_response(row) for row in listing.dues],
    )


def _intake_review_response(review: IntakeReview) -> IntakeReviewResponse:
    return IntakeReviewResponse(
        document_id=review.document_id,
        tenant_id=review.tenant_id,
        status=review.status,
        source_filename=review.source_filename,
        vendor_name=review.vendor_name,
        invoice_date=review.invoice_date,
        tax_year=review.tax_year,
        country_code=review.country_code,
        extracted_tot_amount=review.extracted_tot_amount,
        table_tot_amount=review.table_tot_amount,
        tot_rate=review.tot_rate,
        subtotal=review.subtotal,
        grand_total=review.grand_total,
        amounts_match=review.amounts_match,
        discrepancies=list(review.discrepancies),
        ready_to_post=review.ready_to_post,
        blocked_reason=review.blocked_reason,
        post_path=review.post_path,
        invoice_id=review.invoice_id,
    )


def _intake_review_list_response(listing: IntakeReviewList) -> IntakeReviewListResponse:
    return IntakeReviewListResponse(
        tenant_id=listing.tenant_id,
        ready_count=listing.ready_count,
        blocked_count=listing.blocked_count,
        reviews=[_intake_review_response(row) for row in listing.reviews],
    )


def _unfiled_invoice_response(row: UnfiledInvoice) -> UnfiledInvoiceResponse:
    return UnfiledInvoiceResponse(
        invoice_id=row.invoice_id,
        vendor_name=row.vendor_name,
        invoice_date=row.invoice_date,
        tax_year=row.tax_year,
        country_code=row.country_code,
        currency_code=row.currency_code,
        subtotal=row.subtotal,
        tot_rate=row.tot_rate,
        tot_amount=row.tot_amount,
        grand_total=row.grand_total,
        document_intake_id=row.document_intake_id,
    )


def _period_readiness_response(readiness: TotPeriodReadiness) -> TotPeriodReadinessResponse:
    return TotPeriodReadinessResponse(
        tenant_id=readiness.tenant_id,
        tax_year=readiness.tax_year,
        country_code=readiness.country_code,
        ready_count=readiness.ready_count,
        blocked_count=readiness.blocked_count,
        unfiled_invoice_count=readiness.unfiled_invoice_count,
        open_return_count=readiness.open_return_count,
        unfiled_tot_amount=readiness.unfiled_tot_amount,
        open_balance=readiness.open_balance,
        intakes_ready=[_intake_review_response(row) for row in readiness.intakes_ready],
        intakes_blocked=[_intake_review_response(row) for row in readiness.intakes_blocked],
        unfiled_invoices=[_unfiled_invoice_response(row) for row in readiness.unfiled_invoices],
        open_returns=[_due_open_return_response(row) for row in readiness.open_returns],
        dues=(
            None
            if readiness.dues is None
            else _annual_summary_due_response(readiness.dues)
        ),
    )


def _annual_summary_list_response(listing: TotAnnualSummaryList) -> TotAnnualSummaryListResponse:
    return TotAnnualSummaryListResponse(
        tenant_id=listing.tenant_id,
        summaries=[_annual_summary_response(summary) for summary in listing.summaries],
    )


def _year_statement_response(statement: TotYearStatement) -> TotYearStatementResponse:
    return TotYearStatementResponse(
        tenant_id=statement.tenant_id,
        tax_year=statement.tax_year,
        country_code=statement.country_code,
        currency_code=statement.currency_code,
        tax_due=statement.tax_due,
        amount_paid=statement.amount_paid,
        balance_due=statement.balance_due,
        filings=[_year_filing(filing) for filing in statement.filings],
    )


def _statement_response(statement: TotStatement) -> TotStatementResponse:
    return TotStatementResponse(
        tenant_id=statement.tenant_id,
        tot_return_id=statement.tot_return_id,
        tax_due=statement.tax_due,
        amount_paid=statement.amount_paid,
        balance_due=statement.balance_due,
        lines=[_statement_line(line) for line in statement.lines],
    )


def _refund_list_response(listing: TotRefundList) -> TotRefundListResponse:
    return TotRefundListResponse(
        tenant_id=listing.tenant_id,
        tot_return_id=listing.tot_return_id,
        tax_due=listing.tax_due,
        amount_paid=listing.amount_paid,
        balance_due=listing.balance_due,
        refunds=[_refund_item(refund) for refund in listing.refunds],
    )


def _payment_list_response(listing: TotPaymentList) -> TotPaymentListResponse:
    return TotPaymentListResponse(
        tenant_id=listing.tenant_id,
        tot_return_id=listing.tot_return_id,
        tax_due=listing.tax_due,
        amount_paid=listing.amount_paid,
        balance_due=listing.balance_due,
        payments=[_payment_item(payment) for payment in listing.payments],
    )


def _return_response(filed: TotReturn) -> TotReturnResponse:
    return TotReturnResponse(
        id=filed.id,
        tenant_id=filed.tenant_id,
        country_code=filed.country_code,
        tax_year=filed.tax_year,
        period_start=filed.period_start,
        period_end=filed.period_end,
        currency_code=filed.currency_code,
        schedule_id=filed.schedule_id,
        rate=filed.rate,
        invoice_count=filed.invoice_count,
        subtotal=filed.subtotal,
        tot_amount=filed.tot_amount,
        grand_total=filed.grand_total,
        due_on=filed.due_on,
        amends_return_id=filed.amends_return_id,
        superseded=filed.superseded,
        filed_at=filed.filed_at,
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


def _document_response(document: DocumentIntake) -> DocumentIntakeResponse:
    return DocumentIntakeResponse(
        id=document.id,
        tenant_id=document.tenant_id,
        status=document.status,
        source_filename=document.source_filename,
        content_type=document.content_type,
        vendor_name=document.vendor_name,
        invoice_date=document.invoice_date,
        currency_code=document.currency_code,
        tax_year=document.tax_year,
        country_code=document.country_code,
        tax_schedule_id=document.tax_schedule_id,
        extracted_subtotal=document.extracted_subtotal,
        extracted_tot_amount=document.extracted_tot_amount,
        extracted_grand_total=document.extracted_grand_total,
        subtotal=document.subtotal,
        tot_rate=document.tot_rate,
        tot_amount=document.tot_amount,
        grand_total=document.grand_total,
        amounts_match=document.amounts_match,
        discrepancies=list(document.discrepancies),
        error_message=document.error_message,
        lines=[
            DocumentLineResponse(
                line_number=line.line_number,
                description=line.description,
                quantity=line.quantity,
                unit_price=line.unit_price,
                extracted_line_total=line.extracted_line_total,
                line_total=line.line_total,
            )
            for line in document.lines
        ],
        created_at=document.created_at,
        completed_at=document.completed_at,
    )
