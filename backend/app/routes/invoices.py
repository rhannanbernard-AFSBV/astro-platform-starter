"""Invoice persist route — OCR extraction → ``invoices`` under RLS."""

from __future__ import annotations

from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_tenant_db_session
from app.deps import verify_tenant_access_token
from app.schemas import InvoicePersistRequest, InvoicePersistResponse

router = APIRouter(prefix="/api/v1/invoices")

_INSERT_INVOICE = """
    INSERT INTO invoices (
        tenant_id, vendor_name, invoice_date,
        subtotal, tot_amount, grand_total
    ) VALUES (%s, %s, %s, %s, %s, %s)
    RETURNING id;
"""


def _parse_invoice_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="invoice_date must be an ISO date string (YYYY-MM-DD).",
        ) from exc


@router.post("/persist", response_model=InvoicePersistResponse)
async def persist_invoice_from_ocr(
    payload: InvoicePersistRequest,
    active_tenant_id: UUID = Depends(verify_tenant_access_token),
) -> InvoicePersistResponse:
    """
    Persist a structured OCR extraction into ``invoices`` for the active tenant.

    Does not recompute TOT — stores extracted ``tot_amount`` / totals as-is.
    RLS GUC is bound via ``get_tenant_db_session`` before INSERT.
    """
    invoice_date = _parse_invoice_date(payload.invoice_date)

    async with get_tenant_db_session(active_tenant_id) as conn:
        result = await conn.execute(
            _INSERT_INVOICE,
            (
                str(active_tenant_id),
                payload.vendor_name,
                invoice_date,
                payload.subtotal,
                payload.tot_amount,
                payload.grand_total,
            ),
        )
        row = await result.fetchone()
        if row is None:
            raise RuntimeError("invoices INSERT returned no id")
        invoice_id = row[0]

    return InvoicePersistResponse(
        message=f"Invoice from {payload.vendor_name} persisted under tenant RLS.",
        invoice_id=invoice_id,
        tenant_id=active_tenant_id,
        vendor_name=payload.vendor_name,
        invoice_date=payload.invoice_date,
        subtotal=payload.subtotal,
        tot_amount=payload.tot_amount,
        grand_total=payload.grand_total,
    )
