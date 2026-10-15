"""Async AI OCR — LLM extracts structured fields only; no financial math."""

from __future__ import annotations

from fastapi import HTTPException, status
from openai import AsyncOpenAI

from app.local_config import get_openai_api_key
from app.schemas import ReceiptExtractionResponse


async def process_invoice_ocr(file_url: str) -> ReceiptExtractionResponse:
    """
    GPT-4o vision extraction mapped to Sint Maarten compliance structures.

    The model must only extract fields; tax math stays in ``tax_engine``.
    Local desktop: requires OpenAI key from env or AppData ``config.json``.
    """
    api_key = get_openai_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "OCR requires an OpenAI API key for local desktop mode. "
                "Set OPENAI_API_KEY in the environment, or add "
                '"openai_api_key" to %LOCALAPPDATA%\\Allyanna\\config.json. '
                "Payroll and TOT math work offline without a key."
            ),
        )

    client = AsyncOpenAI(api_key=api_key)
    response = await client.beta.chat.completions.parse(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a local financial audit OCR scanner specialized in "
                    "Sint Maarten invoices. Extract the tax data fields exactly. "
                    "Do not compute or recalculate taxes — extract printed values only."
                ),
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "Extract all structural ledger fields from this "
                            "Sint Maarten business document."
                        ),
                    },
                    {"type": "image_url", "image_url": {"url": file_url}},
                ],
            },
        ],
        response_format=ReceiptExtractionResponse,
    )
    parsed = response.choices[0].message.parsed
    if parsed is None:
        raise ValueError("OCR model returned no structured extraction.")
    return parsed
