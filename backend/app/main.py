"""Allyanna Accounting Software — integrated Sint Maarten FastAPI entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from app.routes.compliance import router as compliance_router
from app.routes.invoices import router as invoices_router
from app.routes.payroll import router as payroll_router
from app.routes.tenant import router as tenant_router
from app.schemas import HealthResponse

app = FastAPI(
    title="Allyanna Accounting Software - Sint Maarten Backend",
    description=(
        "Integrated multi-tenant SXM compliance API: tax engine, RLS-scoped "
        "Postgres sessions, compliance chat, OCR extract, invoice persist, "
        "and monthly payroll run."
    ),
)
app.include_router(compliance_router)
app.include_router(tenant_router)
app.include_router(payroll_router)
app.include_router(invoices_router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="allyanna-backend")
