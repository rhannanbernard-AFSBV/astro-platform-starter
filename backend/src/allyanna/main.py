"""Allyanna FastAPI application."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from allyanna import __version__
from allyanna.api import allyanna_error_handler, router
from allyanna.config import get_settings
from allyanna.db import create_pool
from allyanna.errors import AllyannaError
from allyanna.invoices.repository import InvoiceRepository
from allyanna.invoices.service import InvoiceService
from allyanna.ocr.extractor import OpenAIDocumentExtractor
from allyanna.ocr.repository import DocumentRepository
from allyanna.ocr.service import DocumentIntakeService
from allyanna.payroll.repository import PayrollRepository
from allyanna.payroll.service import PayrollService
from allyanna.readiness.service import TotPeriodReadinessService
from allyanna.tax.cache import TaxTableCache
from allyanna.tax.repository import TaxRepository
from allyanna.tax.service import TaxService
from allyanna.tenancy.repository import TenancyRepository
from allyanna.tenancy.service import TenancyService
from allyanna.worksheets.payments import TotPaymentRepository
from allyanna.worksheets.refunds import TotRefundRepository
from allyanna.worksheets.summaries import TotAnnualSummaryRepository
from allyanna.worksheets.repository import WorksheetRepository
from allyanna.worksheets.returns import TotReturnRepository
from allyanna.worksheets.service import TotWorksheetService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    tax_repository = TaxRepository()
    tenancy_service = TenancyService(TenancyRepository())
    app.state.pool = None
    app.state.tenancy_service = tenancy_service
    if settings.database_url:
        app.state.pool = await create_pool(settings.database_url)
    tax_service = TaxService(
        TaxTableCache(settings.tax_cache_ttl_seconds, tax_repository),
        tax_repository,
        tenancy_service,
    )
    app.state.tax_service = tax_service
    app.state.document_extractor = OpenAIDocumentExtractor(
        api_key=settings.openai_api_key,
        model=settings.openai_model,
    )
    app.state.document_intake_service = DocumentIntakeService(
        pool=app.state.pool,
        repository=DocumentRepository(),
        tax=tax_service,
        tenancy=tenancy_service,
        extractor_provider=lambda: app.state.document_extractor,
    )
    app.state.invoice_service = InvoiceService(
        InvoiceRepository(),
        tax_service,
        tenancy_service,
        documents=app.state.document_intake_service,
    )
    app.state.worksheet_service = TotWorksheetService(
        WorksheetRepository(),
        tax_service,
        tenancy_service,
        returns=TotReturnRepository(),
        payments=TotPaymentRepository(),
        refunds=TotRefundRepository(),
        summaries=TotAnnualSummaryRepository(),
    )
    app.state.payroll_service = PayrollService(PayrollRepository(), tax_service, tenancy_service)
    app.state.readiness_service = TotPeriodReadinessService(
        app.state.invoice_service,
        app.state.worksheet_service,
        tenancy_service,
    )
    yield
    pool = app.state.pool
    if pool is not None:
        await pool.close()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Allyanna Accounting",
        version=__version__,
        summary="Multi-tenant Sint Maarten tax and business-profile API",
        lifespan=lifespan,
    )
    app.add_exception_handler(AllyannaError, allyanna_error_handler)
    app.include_router(router, prefix="/api/v1")
    return app


app = create_app()
