"""Fields copied from a document. Amounts stay strings so nothing becomes a float."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from allyanna.errors import InvalidDocument


def _decimal_string(value: object) -> str:
    if isinstance(value, bool) or isinstance(value, float):
        raise ValueError("amounts must be decimal strings")
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        text = value.strip()
        try:
            parsed = Decimal(text)
        except Exception as exc:
            raise ValueError("amounts must be decimal strings") from exc
        if not parsed.is_finite():
            raise ValueError("amounts must be finite")
        return text
    raise ValueError("amounts must be decimal strings")


class ExtractedLinePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=1, max_length=400)
    quantity: str
    unit_price: str
    line_total: str | None = None

    @field_validator("description", mode="before")
    @classmethod
    def strip_description(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("quantity", "unit_price", "line_total", mode="before")
    @classmethod
    def amounts_are_strings(cls, value: object) -> object:
        if value is None:
            return None
        return _decimal_string(value)


class ExtractedDocumentPayload(BaseModel):
    """Printed fields only. Callers recompute totals from the lines."""

    model_config = ConfigDict(extra="forbid")

    vendor_name: str = Field(min_length=1, max_length=200)
    invoice_date: date
    subtotal: str
    tot_amount: str
    grand_total: str
    lines: list[ExtractedLinePayload] = Field(min_length=1, max_length=100)

    @field_validator("vendor_name", mode="before")
    @classmethod
    def strip_vendor(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("subtotal", "tot_amount", "grand_total", mode="before")
    @classmethod
    def amounts_are_strings(cls, value: object) -> object:
        return _decimal_string(value)

    @field_validator("invoice_date", mode="before")
    @classmethod
    def date_is_not_a_number(cls, value: object) -> object:
        if isinstance(value, bool) or isinstance(value, float) or isinstance(value, int):
            raise ValueError("invoice_date must be an ISO date")
        return value


def parse_extraction(payload: ExtractedDocumentPayload | dict[str, object]) -> ExtractedDocumentPayload:
    try:
        if isinstance(payload, ExtractedDocumentPayload):
            return payload
        return ExtractedDocumentPayload.model_validate(payload)
    except Exception as exc:
        raise InvalidDocument("Extracted document could not be validated") from exc
