"""Chat / compliance and OCR route handlers."""

from __future__ import annotations

from typing import Union

from fastapi import APIRouter, Depends

from app.chat import run_compliance_chat
from app.deps import get_tenant_context
from app.ocr import process_invoice_ocr
from app.schemas import (
    ChatQueryRequest,
    ComplianceCalculationResponse,
    ComplianceConversationResponse,
    OcrJobResponse,
    OcrRequest,
    TenantContext,
)
from app.tax_tables import get_tax_rates

router = APIRouter(prefix="/api/v1")


@router.post(
    "/chat/compliance",
    response_model=Union[ComplianceCalculationResponse, ComplianceConversationResponse],
)
async def process_allyanna_compliance_query(
    payload: ChatQueryRequest,
    tenant: TenantContext = Depends(get_tenant_context),
) -> Union[ComplianceCalculationResponse, ComplianceConversationResponse]:
    """Route conversational tax/payroll intents to the Decimal calculation engine."""
    active_rates = get_tax_rates(tax_year=payload.tax_year, country_code="SXM")
    return await run_compliance_chat(
        user_prompt=payload.user_prompt,
        tenant_id=tenant.tenant_id,
        active_rates=active_rates,
    )


@router.post("/ocr/receipts", response_model=OcrJobResponse)
async def extract_receipt_ocr(
    payload: OcrRequest,
    tenant: TenantContext = Depends(get_tenant_context),
) -> OcrJobResponse:
    """Thin async OCR route — LLM extracts fields only; no tax math."""
    extraction = await process_invoice_ocr(payload.file_url)
    return OcrJobResponse(
        tenant_id=tenant.tenant_id,
        status="extracted",
        extraction=extraction,
    )
