"""Refunds against a filed turnover-tax return.

A refund reduces the amount paid. It does not remove the payment row.
This module does not know a tax rate.
"""

from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from allyanna.errors import InvalidPayment
from allyanna.money import as_decimal
from allyanna.worksheets.models import TotRefund

Connection = Any

_COLUMNS = """
    id, tenant_id, tot_return_id, amount, refunded_on, recorded_at
"""


class TotRefundRepository:
    async def insert(
        self,
        conn: Connection,
        *,
        return_id: UUID,
        amount: Decimal,
        refunded_on: date,
    ) -> TotRefund:
        try:
            row = await conn.fetchrow(
                f"""
                INSERT INTO allyanna.tot_return_refunds (
                  tenant_id, tot_return_id, amount, refunded_on
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  $1, $2, $3
                )
                RETURNING {_COLUMNS}
                """,
                return_id,
                amount,
                refunded_on,
            )
        except asyncpg.RaiseError as exc:
            message = str(exc)
            if "exceeds" in message:
                raise InvalidPayment("The refund exceeds the amount paid") from exc
            raise InvalidPayment("The refund does not belong to this turnover-tax return") from exc
        return _refund_from_row(row)

    async def list_for_return(self, conn: Connection, return_id: UUID) -> tuple[TotRefund, ...]:
        rows = await conn.fetch(
            f"""
            SELECT {_COLUMNS}
            FROM allyanna.tot_return_refunds
            WHERE tot_return_id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            ORDER BY refunded_on, recorded_at, id
            """,
            return_id,
        )
        return tuple(_refund_from_row(row) for row in rows)

    async def get_refund(self, conn: Connection, refund_id: UUID) -> TotRefund | None:
        row = await conn.fetchrow(
            f"""
            SELECT {_COLUMNS}
            FROM allyanna.tot_return_refunds
            WHERE id = $1
              AND tenant_id = current_setting('allyanna.tenant_id', true)::uuid
            """,
            refund_id,
        )
        if row is None:
            return None
        return _refund_from_row(row)


def _refund_from_row(row: Any) -> TotRefund:
    return TotRefund(
        id=row["id"],
        tenant_id=row["tenant_id"],
        tot_return_id=row["tot_return_id"],
        amount=as_decimal(row["amount"]),
        refunded_on=row["refunded_on"],
        recorded_at=row["recorded_at"],
    )
