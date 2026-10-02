"""Allyanna Accounting Software — monthly payroll run FastAPI entrypoint."""

from __future__ import annotations

from fastapi import FastAPI

from app.routes.payroll import router as payroll_router
from app.schemas import HealthResponse

app = FastAPI(title="Allyanna Accounting Software - Monthly Payroll Run")
app.include_router(payroll_router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service="allyanna-payroll-monthly-run")
