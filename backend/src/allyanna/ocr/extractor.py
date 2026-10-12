"""GPT-4o copies printed fields. It is not asked to calculate."""

import base64
from typing import Any, Protocol

from allyanna.errors import ExtractionFailed
from allyanna.ocr.payload import ExtractedDocumentPayload

EXTRACTION_INSTRUCTIONS = (
    "You extract printed fields from a receipt or invoice. "
    "Copy vendor_name, invoice_date, subtotal, tot_amount, grand_total, and each line "
    "exactly as printed. Return every amount as a decimal string. "
    "Do not calculate tax, totals, percentages, or line amounts. "
    "Do not add, multiply, subtract, or reconcile the figures. "
    "If a line total is not printed, set line_total to null. "
    "invoice_date is an ISO date."
)

_ACCEPTED_TYPES = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
    "application/pdf": "file",
}


class DocumentExtractor(Protocol):
    async def extract(
        self,
        *,
        content: bytes,
        content_type: str,
        filename: str,
    ) -> ExtractedDocumentPayload:
        """Return the printed fields. Do not compute totals."""


class OpenAIDocumentExtractor:
    def __init__(
        self,
        api_key: str | None,
        model: str = "gpt-4o",
        client: Any | None = None,
    ) -> None:
        self._api_key = api_key.strip() if isinstance(api_key, str) else ""
        self._model = model or "gpt-4o"
        self._client = client

    async def extract(
        self,
        *,
        content: bytes,
        content_type: str,
        filename: str,
    ) -> ExtractedDocumentPayload:
        client = self._client or self._build_client()
        try:
            response = await client.chat.completions.parse(
                model=self._model,
                messages=[
                    {"role": "system", "content": EXTRACTION_INSTRUCTIONS},
                    {
                        "role": "user",
                        "content": _user_content(content, content_type, filename),
                    },
                ],
                response_format=ExtractedDocumentPayload,
            )
        except ExtractionFailed:
            raise
        except Exception as exc:
            raise ExtractionFailed("Document extraction failed") from exc
        choice = response.choices[0].message
        if choice.parsed is None:
            raise ExtractionFailed("The model did not return the printed fields")
        if not isinstance(choice.parsed, ExtractedDocumentPayload):
            raise ExtractionFailed("The model response failed validation")
        return choice.parsed

    def _build_client(self) -> Any:
        if not self._api_key:
            raise ExtractionFailed("OPENAI_API_KEY is not configured")
        from openai import AsyncOpenAI

        return AsyncOpenAI(api_key=self._api_key, timeout=60)


def _user_content(content: bytes, content_type: str, filename: str) -> list[dict[str, object]]:
    kind = _ACCEPTED_TYPES.get(content_type)
    if kind is None:
        raise ExtractionFailed("This file type cannot be read")
    encoded = base64.b64encode(content).decode("ascii")
    if kind == "file":
        attachment: dict[str, object] = {
            "type": "file",
            "file": {
                "filename": filename,
                "file_data": f"data:{content_type};base64,{encoded}",
            },
        }
    else:
        attachment = {
            "type": "image_url",
            "image_url": {"url": f"data:{content_type};base64,{encoded}"},
        }
    return [
        {"type": "text", "text": "Extract the printed invoice or receipt fields."},
        attachment,
    ]
