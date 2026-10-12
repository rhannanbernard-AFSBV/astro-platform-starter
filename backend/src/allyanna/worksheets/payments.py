"""Payments against a filed turnover-tax return.

Tax due is the stored return's tot_amount. This module does not know a tax rate.
"""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from allyanna.errors import InvalidPayment
from allyanna.money import as_decimal
from allyanna.worksheets.models import TotPayment

Connection = Any

_COLUMNS = """
    id, tenant_id, tot_return_id, amount, paid_on, recorded_at
"""


class TotPaymentRepository:
    async def insert(
        self,
        conn: Connection,
        *,
        return_id: UUID,
        amount: Decimal,
        paid_on: date,
    ) -> TotPayment:
        try:
            row = await conn.fetchrow(
                f"""
                INSERT INTO allyanna.tot_return_payments (
                  tenant_id, tot_return_id, amount, paid_on
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3
                )
                RETURNING {_COLUMNS}
                """,
                return_id,
                amount,
                paid_on,
            )
        except asyncpg.RaiseError as exc:
            message = str(exc)
            if "exceeds" in message:
                raise InvalidPayment("The payment exceeds the unpaid turnover tax") from exc
            raise InvalidPayment("The payment does not belong to this turnover-tax return") from exc
        return _payment_from_row(row)

    async def list_for_return(self, conn: Connection, return_id: UUID) -> tuple[TotPayment, ...]:
        rows = await conn.fetch(
            f"""
            SELECT {_COLUMNS}
            FROM allyanna.tot_return_payments
            WHERE tot_return_id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY paid_on, recorded_at, id
            """,
            return_id,
        )
        return tuple(_payment_from_row(row) for row in rows)

    async def get_payment(self, conn: Connection, payment_id: UUID) -> TotPayment | None:
        row = await conn.fetchrow(
            f"""
            SELECT {_COLUMNS}
            FROM allyanna.tot_return_payments
            WHERE id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            payment_id,
        )
        if row is None:
            return None
        return _payment_from_row(row)


def _payment_from_row(row: Any) -> TotPayment:
    return TotPayment(
        id=row["id"],
        tenant_id=row["tenant_id"],
        tot_return_id=row["tot_return_id"],
        amount=as_decimal(row["amount"]),
        paid_on=row["paid_on"],
        recorded_at=row["recorded_at"],
    )
