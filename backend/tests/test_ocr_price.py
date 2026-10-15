"""Line pricing and the extraction contract. No tax rate lives in these modules."""

import base64
from decimal import Decimal

import pytest
from pydantic import ValidationError

from allyanna.errors import ExtractionFailed, InvalidDocument
from allyanna.ocr.extractor import EXTRACTION_INSTRUCTIONS, OpenAIDocumentExtractor
from allyanna.ocr.payload import ExtractedDocumentPayload, ExtractedLinePayload, parse_extraction
from allyanna.ocr.price import PricedLine, amount_discrepancies, price_lines, require_quantity


def _document(**overrides: object) -> ExtractedDocumentPayload:
    body: dict[str, object] = {
        "vendor_name": "Philipsburg Market",
        "invoice_date": "2026-04-02",
        "subtotal": "215.00",
        "tot_amount": "10.75",
        "grand_total": "225.75",
        "lines": [
            {
                "description": "Rice",
                "quantity": "2",
                "unit_price": "100.00",
                "line_total": "200.00",
            },
            {
                "description": "Oil",
                "quantity": "1.5",
                "unit_price": "10.00",
                "line_total": "15.00",
            },
        ],
    }
    body.update(overrides)
    return ExtractedDocumentPayload.model_validate(body)


def test_price_lines_multiply_quantity_by_unit_price() -> None:
    priced = price_lines(_document())
    assert priced.subtotal == Decimal("215.00")
    assert priced.lines[0].line_total == Decimal("200.00")
    assert priced.lines[1].line_total == Decimal("15.00")
    assert priced.lines[1].quantity == Decimal("1.5")


def test_quantity_rejects_zero_extra_places_and_floats() -> None:
    with pytest.raises(InvalidDocument):
        require_quantity(Decimal("0"))
    with pytest.raises(InvalidDocument):
        require_quantity(Decimal("-1"))
    with pytest.raises(InvalidDocument):
        require_quantity(Decimal("1.00001"))
    with pytest.raises(InvalidDocument):
        require_quantity(1.5)  # type: ignore[arg-type]
    zero = _document()
    zero.lines[0] = ExtractedLinePayload(
        description="Rice",
        quantity="0",
        unit_price="100.00",
    )
    with pytest.raises(InvalidDocument):
        price_lines(zero)


def test_amount_discrepancies_name_the_printed_figures_that_differ() -> None:
    found = amount_discrepancies(
        extracted_subtotal=Decimal("215.00"),
        extracted_tot_amount=Decimal("999.99"),
        extracted_grand_total=Decimal("225.75"),
        subtotal=Decimal("215.00"),
        tot_amount=Decimal("10.75"),
        grand_total=Decimal("225.75"),
        lines=(
            PricedLine(
                description="Rice",
                quantity=Decimal("2"),
                unit_price=Decimal("100.00"),
                extracted_line_total=Decimal("10.00"),
                line_total=Decimal("200.00"),
            ),
        ),
    )
    assert found[0].startswith("tot_amount extracted 999.99")
    assert found[1].startswith("line 1 total extracted 10.00")
    assert all(not item.startswith("subtotal") for item in found)


def test_extraction_payload_keeps_amounts_as_decimal_strings() -> None:
    schema = ExtractedDocumentPayload.model_json_schema()["properties"]
    assert schema["subtotal"]["type"] == "string"
    assert schema["tot_amount"]["type"] == "string"
    assert schema["grand_total"]["type"] == "string"
    with pytest.raises(ValidationError):
        ExtractedDocumentPayload.model_validate(
            {
                "vendor_name": "Shop",
                "invoice_date": "2026-04-02",
                "subtotal": 215.0,
                "tot_amount": "10.75",
                "grand_total": "225.75",
                "lines": [
                    {"description": "Rice", "quantity": "2", "unit_price": "100.00"},
                ],
            }
        )
    with pytest.raises(InvalidDocument):
        parse_extraction(
            {
                "vendor_name": "Shop",
                "invoice_date": "2026-04-02",
                "subtotal": "215.00",
                "tot_amount": "10.75",
                "grand_total": "225.75",
                "lines": [
                    {"description": "Rice", "quantity": 2.5, "unit_price": "100.00"},
                ],
            }
        )


class _ParsedMessage:
    def __init__(self, parsed: object) -> None:
        self.parsed = parsed


class _Choice:
    def __init__(self, parsed: object) -> None:
        self.message = _ParsedMessage(parsed)


class _Response:
    def __init__(self, parsed: object) -> None:
        self.choices = [_Choice(parsed)]


class _Completions:
    def __init__(self, parsed: object) -> None:
        self.parsed = parsed
        self.kwargs: dict[str, object] | None = None

    async def parse(self, **kwargs: object) -> _Response:
        self.kwargs = kwargs
        return _Response(self.parsed)


class _Chat:
    def __init__(self, completions: _Completions) -> None:
        self.completions = completions


class _Client:
    def __init__(self, parsed: object) -> None:
        self.completions = _Completions(parsed)
        self.chat = _Chat(self.completions)


@pytest.mark.asyncio
async def test_openai_extractor_asks_only_for_printed_fields() -> None:
    payload = _document()
    client = _Client(payload)
    extractor = OpenAIDocumentExtractor(api_key="test-key", client=client)
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    result = await extractor.extract(content=png, content_type="image/png", filename="receipt.png")
    assert result == payload
    kwargs = client.completions.kwargs
    assert kwargs is not None
    assert kwargs["response_format"] is ExtractedDocumentPayload
    assert kwargs["model"] == "gpt-4o"
    messages = kwargs["messages"]
    assert isinstance(messages, list)
    assert messages[0] == {"role": "system", "content": EXTRACTION_INSTRUCTIONS}
    user_content = messages[1]["content"]
    assert user_content[1]["image_url"]["url"].startswith("data:image/png;base64,")
    assert "Do not calculate tax, totals, percentages, or line amounts." in EXTRACTION_INSTRUCTIONS


@pytest.mark.asyncio
async def test_pdf_attachment_is_a_file_and_a_missing_key_does_not_call_out() -> None:
    payload = _document()
    client = _Client(payload)
    extractor = OpenAIDocumentExtractor(api_key="test-key", client=client)
    await extractor.extract(content=b"%PDF-1.4", content_type="application/pdf", filename="bill.pdf")
    user_content = client.completions.kwargs["messages"][1]["content"]  # type: ignore[index]
    attachment = user_content[1]
    assert attachment["type"] == "file"
    assert attachment["file"]["file_data"].startswith("data:application/pdf;base64,")

    missing = OpenAIDocumentExtractor(api_key=None)
    with pytest.raises(ExtractionFailed, match="OPENAI_API_KEY"):
        await missing.extract(content=b"x", content_type="image/png", filename="a.png")
