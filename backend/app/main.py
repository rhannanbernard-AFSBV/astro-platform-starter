"""Allyanna Accounting Software — tenant DB session FastAPI entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from app.routes.tenant import router as tenant_router
from app.schemas import HealthResponse

app = FastAPI(title="Allyanna Accounting Software - Tenant DB Session")
app.include_router(tenant_router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="allyanna-tenant-db-session")
