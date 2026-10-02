"""Allyanna Accounting Software — Sint Maarten compliance FastAPI entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from app.routes.compliance import router as compliance_router
from app.schemas import HealthResponse

app = FastAPI(title="Allyanna Accounting Software - Sint Maarten Core Backend")
app.include_router(compliance_router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="allyanna-sxm-core")
