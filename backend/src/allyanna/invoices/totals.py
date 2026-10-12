"""Line totals for an invoice. Turnover tax is applied by the tax service."""

from decimal import Decimal

from allyanna.errors import InvalidInvoice
from allyanna.invoices.models import InvoiceLineInput, PricedLine
from allyanna.money import money, require_money

QUANTITY_STEP = Decimal("0.0001")


def require_quantity(quantity: Decimal) -> Decimal:
    if not isinstance(quantity, Decimal) or not quantity.is_finite():
        raise InvalidInvoice("quantity must be a finite decimal")
    if quantity <= 0:
        raise InvalidInvoice("quantity must be greater than zero")
    if quantity != quantity.quantize(QUANTITY_STEP):
        raise InvalidInvoice("quantity supports four decimal places")
    return quantity


def price_lines(lines: tuple[InvoiceLineInput, ...] | list[InvoiceLineInput]) -> tuple[tuple[PricedLine, ...], Decimal]:
    if not lines:
        raise InvalidInvoice("an invoice needs at least one line")
    priced: list[PricedLine] = []
    subtotal = Decimal("0.00")
    for index, line in enumerate(lines, start=1):
        description = line.description.strip()
        if not description:
            raise InvalidInvoice("each line needs a description")
        quantity = require_quantity(line.quantity)
        unit_price = require_money(line.unit_price)
        line_total = money(quantity * unit_price)
        priced.append(
            PricedLine(
                line_number=index,
                description=description,
                quantity=quantity,
                unit_price=unit_price,
                line_total=line_total,
            )
        )
        subtotal = money(subtotal + line_total)
    return tuple(priced), subtotal
