"""Async AI OCR — LLM extracts structured fields only; no financial math."""

from __future__ import annotations

import os

from openai import AsyncOpenAI

from app.schemas import ReceiptExtractionResponse

openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", "mock-key"))


async def process_invoice_ocr(file_url: str) -> ReceiptExtractionResponse:
    """
    GPT-4o vision extraction mapped to Sint Maarten compliance structures.

    The model must only extract fields; tax math stays in ``tax_engine``.
    """
    response = await openai_client.beta.chat.completions.parse(
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
