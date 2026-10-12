"""Price extracted lines. This module does not know a tax rate."""

from dataclasses import dataclass
from decimal import Decimal

from allyanna.errors import InvalidDocument
from allyanna.money import money, require_money
from allyanna.ocr.payload import ExtractedDocumentPayload, ExtractedLinePayload


@dataclass(frozen=True)
class PricedLine:
    description: str
    quantity: Decimal
    unit_price: Decimal
    extracted_line_total: Decimal | None
    line_total: Decimal


@dataclass(frozen=True)
class PricedLines:
    lines: tuple[PricedLine, ...]
    subtotal: Decimal


def require_quantity(value: Decimal) -> Decimal:
    if not isinstance(value, Decimal) or not value.is_finite():
        raise InvalidDocument("Quantity must be a decimal")
    if value <= 0:
        raise InvalidDocument("Quantity must be greater than zero")
    exponent = value.normalize().as_tuple().exponent
    if not isinstance(exponent, int) or exponent < -4:
        raise InvalidDocument("Quantity supports four decimal places")
    return value


def price_lines(payload: ExtractedDocumentPayload) -> PricedLines:
    if not payload.lines:
        raise InvalidDocument("A document needs at least one line")
    priced: list[PricedLine] = []
    for line in payload.lines:
        priced.append(_price_line(line))
    subtotal = money(sum((line.line_total for line in priced), Decimal("0")))
    return PricedLines(lines=tuple(priced), subtotal=subtotal)


def amount_discrepancies(
    *,
    extracted_subtotal: Decimal,
    extracted_tot_amount: Decimal,
    extracted_grand_total: Decimal,
    subtotal: Decimal,
    tot_amount: Decimal,
    grand_total: Decimal,
    lines: tuple[PricedLine, ...],
) -> tuple[str, ...]:
    """Compare printed header and line amounts with the recomputed ones."""
    found: list[str] = []
    _compare(found, "subtotal", extracted_subtotal, subtotal)
    _compare(found, "tot_amount", extracted_tot_amount, tot_amount)
    _compare(found, "grand_total", extracted_grand_total, grand_total)
    for index, line in enumerate(lines, start=1):
        if line.extracted_line_total is None:
            continue
        _compare(found, f"line {index} total", line.extracted_line_total, line.line_total)
    return tuple(found)


def _price_line(line: ExtractedLinePayload) -> PricedLine:
    description = line.description.strip()
    if not description:
        raise InvalidDocument("Line description is required")
    quantity = require_quantity(Decimal(line.quantity))
    unit_price = require_money(Decimal(line.unit_price))
    extracted = None if line.line_total is None else require_money(Decimal(line.line_total))
    return PricedLine(
        description=description,
        quantity=quantity,
        unit_price=unit_price,
        extracted_line_total=extracted,
        line_total=money(quantity * unit_price),
    )


def _compare(found: list[str], label: str, extracted: Decimal, recomputed: Decimal) -> None:
    if extracted != recomputed:
        found.append(
            f"{label} extracted {format(extracted, 'f')} recomputed {format(recomputed, 'f')}"
        )
