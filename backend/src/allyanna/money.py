"""Decimal money helpers. Financial values never pass through float."""

from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated

from pydantic import PlainSerializer, WithJsonSchema

from allyanna.errors import InvalidMoney

CENT = Decimal("0.01")


def as_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool) or isinstance(value, float):
        raise InvalidMoney("refusing to coerce a non-decimal number")
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, str):
        return Decimal(value)
    raise InvalidMoney("unsupported numeric value")


def money(amount: Decimal) -> Decimal:
    if not isinstance(amount, Decimal):
        raise InvalidMoney("money values must be Decimal")
    if not amount.is_finite():
        raise InvalidMoney("money values must be finite")
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def require_money(amount: Decimal) -> Decimal:
    if not isinstance(amount, Decimal):
        raise InvalidMoney("money values must be Decimal")
    if not amount.is_finite():
        raise InvalidMoney("money values must be finite")
    if amount < 0:
        raise InvalidMoney("money values cannot be negative")
    rounded = amount.quantize(CENT)
    if amount != rounded:
        raise InvalidMoney("money values support cent precision")
    return amount


def require_rate(rate: Decimal) -> Decimal:
    if not isinstance(rate, Decimal) or not rate.is_finite():
        raise InvalidMoney("rates must be finite decimals")
    if rate < 0 or rate > 1:
        raise InvalidMoney("rates must be between 0 and 1")
    return rate


def money_to_json(value: Decimal) -> str:
    return format(money(value), "f")


def plain_decimal(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def rate_to_json(value: Decimal) -> str:
    return plain_decimal(value)


Money = Annotated[
    Decimal,
    PlainSerializer(money_to_json, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "examples": ["100.00"]}),
]

Rate = Annotated[
    Decimal,
    PlainSerializer(rate_to_json, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "examples": ["0.05"]}),
]

Quantity = Annotated[
    Decimal,
    PlainSerializer(plain_decimal, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "examples": ["1.5"]}),
]
