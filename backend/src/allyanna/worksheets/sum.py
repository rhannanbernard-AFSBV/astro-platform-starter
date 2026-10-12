"""Add posted money amounts. This module does not know a tax rate."""

from decimal import Decimal

from allyanna.money import money, require_money


def sum_money(amounts: tuple[Decimal, ...] | list[Decimal]) -> Decimal:
    total = Decimal("0")
    for amount in amounts:
        total = money(total + require_money(amount))
    return money(total)
