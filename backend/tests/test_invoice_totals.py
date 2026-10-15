"""Invoice line totals stay in Decimal and do not assume a turnover-tax rate."""

from decimal import Decimal

import pytest

from allyanna.errors import InvalidInvoice
from allyanna.invoices.models import InvoiceLineInput
from allyanna.invoices.totals import price_lines
from allyanna.tax.calculate import calculate_tot


def test_subtotal_is_the_sum_of_line_totals() -> None:
    priced, subtotal = price_lines(
        [
            InvoiceLineInput("Dry goods", Decimal("2"), Decimal("100.00")),
            InvoiceLineInput("Produce", Decimal("1.5"), Decimal("10.00")),
        ]
    )
    assert priced[0].line_total == Decimal("200.00")
    assert priced[1].line_total == Decimal("15.00")
    assert subtotal == Decimal("215.00")
    taxed = calculate_tot(subtotal, Decimal("0.07"))
    assert taxed.tot_amount == Decimal("15.05")
    assert taxed.tot_amount != calculate_tot(subtotal, Decimal("0.05")).tot_amount


def test_quantity_must_be_positive_and_four_decimal_places() -> None:
    with pytest.raises(InvalidInvoice):
        price_lines([InvoiceLineInput("Empty", Decimal("0"), Decimal("10.00"))])
    with pytest.raises(InvalidInvoice):
        price_lines([InvoiceLineInput("Fine", Decimal("1.23456"), Decimal("10.00"))])
    with pytest.raises(InvalidInvoice):
        price_lines([])
