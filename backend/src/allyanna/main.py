"""Allyanna FastAPI application."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI

from allyanna import __version__
from allyanna.api import allyanna_error_handler, router
from allyanna.config import get_settings
from allyanna.db import create_pool
from allyanna.errors import AllyannaError
from allyanna.tax.cache import TaxTableCache
from allyanna.tax.repository import TaxRepository
from allyanna.tax.service import TaxService
from allyanna.tenancy.repository import TenancyRepository
from allyanna.tenancy.service import TenancyService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    tax_repository = TaxRepository()
    tenancy_service = TenancyService(TenancyRepository())
    app.state.pool = None
    app.state.tenancy_service = tenancy_service
    app.state.tax_service = TaxService(
        TaxTableCache(settings.tax_cache_ttl_seconds, tax_repository),
        tax_repository,
        tenancy_service,
    )
    if settings.database_url:
        app.state.pool = await create_pool(settings.database_url)
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
