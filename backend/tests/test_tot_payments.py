"""A payment settles the turnover tax stored on a filed return."""

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from allyanna.schemas import TotPaymentRequest
from allyanna.tenancy.repository import TenancyRepository

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
SIMPSON_BAY = "22222222-2222-4222-8222-222222222222"
OTHER_TENANT = "22222222-2222-4222-8222-222222222223"
HARBOUR = UUID("11111111-1111-4111-8111-111111111111")
OTHER_FIRM = UUID("11111111-1111-4111-8111-111111111112")
DEMO_USER = "33333333-3333-4333-8333-333333333333"
DEV_KEY = "allyanna-dev-key"
OTHER_KEY = "allyanna-other-key"


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def _file(client: TestClient, key: str, start: str, end: str) -> object:
    return client.post(
        "/api/v1/tax/tot/returns",
        headers=_auth(key),
        json={
            "period_start": start,
            "period_end": end,
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )


def _pay(client: TestClient, key: str, return_id: str, amount: object, paid_on: str) -> object:
    return client.post(
        f"/api/v1/tax/tot/returns/{return_id}/payments",
        headers=_auth(key),
        json={"amount": amount, "paid_on": paid_on},
    )


def test_json_float_payment_is_rejected() -> None:
    with pytest.raises(ValueError):
        TotPaymentRequest.model_validate({"amount": 4.0, "paid_on": "2026-12-20"})
    parsed = TotPaymentRequest.model_validate({"amount": "4.00", "paid_on": "2026-12-20"})
    assert parsed.amount == Decimal("4.00")
    assert parsed.paid_on == date(2026, 12, 20)


def test_payment_requires_a_business_profile(client: TestClient, admin_sql) -> None:
    admin_sql(f"DELETE FROM allyanna.user_active_contexts WHERE user_id = '{DEMO_USER}'")
    missing = _pay(client, DEV_KEY, str(uuid4()), "1.00", "2026-12-20")
    assert missing.status_code == 409
    assert missing.json()["code"] == "tenant_context_required"


def test_payments_reduce_the_filed_turnover_tax(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "December Goods",
            "invoice_number": "PAY-200",
            "invoice_date": "2026-12-05",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )
    assert created.status_code == 201
    filed = _file(client, DEV_KEY, "2026-12-01", "2026-12-15")
    assert filed.status_code == 201
    body = filed.json()
    assert body["subtotal"] == "200.00"
    assert body["tot_amount"] == "10.00"
    assert body["grand_total"] == "210.00"
    return_id = body["id"]

    first = _pay(client, DEV_KEY, return_id, "4.00", "2026-12-20")
    assert first.status_code == 201
    paid = first.json()
    assert paid["tenant_id"] == GREAT_BAY
    assert paid["tot_return_id"] == return_id
    assert paid["amount"] == "4.00"
    assert paid["paid_on"] == "2026-12-20"
    assert paid["tax_due"] == "10.00"
    assert paid["amount_paid"] == "4.00"
    assert paid["balance_due"] == "6.00"
    assert isinstance(paid["amount"], str)
    assert isinstance(paid["balance_due"], str)
    payment_id = paid["id"]

    second = _pay(client, DEV_KEY, return_id, "6.00", "2026-12-28")
    assert second.status_code == 201
    assert second.json()["amount_paid"] == "10.00"
    assert second.json()["balance_due"] == "0.00"
    assert second.json()["tax_due"] == "10.00"

    over = _pay(client, DEV_KEY, return_id, "0.01", "2026-12-29")
    assert over.status_code == 422
    assert over.json()["code"] == "invalid_payment"
    zero = _pay(client, DEV_KEY, return_id, "0.00", "2026-12-29")
    assert zero.status_code == 422
    assert zero.json()["code"] == "invalid_payment"
    negative = _pay(client, DEV_KEY, return_id, "-1.00", "2026-12-29")
    assert negative.status_code == 422
    assert negative.json()["code"] == "invalid_money"
    floated = _pay(client, DEV_KEY, return_id, 4.0, "2026-12-29")
    assert floated.status_code == 422
    cents = _pay(client, DEV_KEY, return_id, "1.001", "2026-12-29")
    assert cents.status_code == 422
    assert cents.json()["code"] == "invalid_money"

    stored = client.get(f"/api/v1/tax/tot/payments/{payment_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["amount"] == "4.00"
    assert stored.json()["balance_due"] == "0.00"
    assert stored.json()["amount_paid"] == "10.00"
    listed = client.get(f"/api/v1/tax/tot/returns/{return_id}/payments", headers=_auth(DEV_KEY))
    assert listed.status_code == 200
    listing = listed.json()
    assert listing["tax_due"] == "10.00"
    assert listing["amount_paid"] == "10.00"
    assert listing["balance_due"] == "0.00"
    assert [item["amount"] for item in listing["payments"]] == ["4.00", "6.00"]

    missing = _pay(client, DEV_KEY, str(uuid4()), "1.00", "2026-12-20")
    assert missing.status_code == 404
    assert missing.json()["code"] == "tot_return_not_found"


def test_a_nil_filing_rejects_a_positive_payment(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    filed = _file(client, DEV_KEY, "2026-01-01", "2026-01-31")
    assert filed.status_code == 201
    assert filed.json()["tot_amount"] == "0.00"
    rejected = _pay(client, DEV_KEY, filed.json()["id"], "1.00", "2026-01-31")
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "invalid_payment"


@pytest.mark.asyncio
async def test_another_firm_cannot_read_the_payment(
    client: TestClient,
    database_url: str,
    admin_sql,
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "December Late",
            "invoice_number": "PAY-LATE",
            "invoice_date": "2026-12-20",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )
    assert created.status_code == 201
    filed = _file(client, DEV_KEY, "2026-12-16", "2026-12-31")
    assert filed.status_code == 201
    assert filed.json()["tot_amount"] == "10.00"
    return_id = filed.json()["id"]
    paid = _pay(client, DEV_KEY, return_id, "4.00", "2026-12-22")
    assert paid.status_code == 201
    assert paid.json()["balance_due"] == "6.00"
    payment_id = paid.json()["id"]

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = client.get(f"/api/v1/tax/tot/payments/{payment_id}", headers=_auth(DEV_KEY))
    sibling_list = client.get(
        f"/api/v1/tax/tot/returns/{return_id}/payments",
        headers=_auth(DEV_KEY),
    )
    sibling_pay = _pay(client, DEV_KEY, return_id, "1.00", "2026-12-23")
    assert sibling.status_code == 404
    assert sibling.json()["code"] == "tot_payment_not_found"
    assert sibling_list.status_code == 404
    assert sibling_list.json()["code"] == "tot_return_not_found"
    assert sibling_pay.status_code == 404
    assert sibling_pay.json()["code"] == "tot_return_not_found"

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = client.get(f"/api/v1/tax/tot/payments/{payment_id}", headers=_auth(OTHER_KEY))
    foreign_list = client.get(
        f"/api/v1/tax/tot/returns/{return_id}/payments",
        headers=_auth(OTHER_KEY),
    )
    foreign_pay = _pay(client, OTHER_KEY, return_id, "1.00", "2026-12-23")
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "tot_payment_not_found"
    assert foreign_list.status_code == 404
    assert foreign_list.json()["code"] == "tot_return_not_found"
    assert foreign_pay.status_code == 404

    own = _file(client, OTHER_KEY, "2026-01-01", "2026-01-31")
    assert own.status_code == 201
    own_id = own.json()["id"]
    try:
        own_list = client.get(
            f"/api/v1/tax/tot/returns/{own_id}/payments",
            headers=_auth(OTHER_KEY),
        )
        assert own_list.status_code == 200
        assert own_list.json()["payments"] == []
        assert own_list.json()["tax_due"] == "0.00"
        assert own_list.json()["amount_paid"] == "0.00"
        assert own_list.json()["balance_due"] == "0.00"
    finally:
        admin_sql(f"DELETE FROM allyanna.tot_returns WHERE id = '{own_id}'")

    await _assert_payment_rls(database_url, UUID(return_id), UUID(payment_id))


async def _assert_payment_rls(database_url: str, return_id: UUID, payment_id: UUID) -> None:
    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            assert await other.fetch(
                "SELECT id FROM allyanna.tot_return_payments WHERE id = $1",
                payment_id,
            ) == []
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
                await other.execute(
                    """
                    INSERT INTO allyanna.tot_return_payments (
                      tenant_id, tot_return_id, amount, paid_on
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      $1, 1.00, DATE '2026-12-24'
                    )
                    """,
                    return_id,
                )
        with pytest.raises(asyncpg.RaiseError, match="does not belong"):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(OTHER_TENANT))
                await other.execute(
                    """
                    INSERT INTO allyanna.tot_return_payments (
                      tenant_id, tot_return_id, amount, paid_on
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      $1, 1.00, DATE '2026-12-24'
                    )
                    """,
                    return_id,
                )
    finally:
        await other.close()

    demo = await asyncpg.connect(database_url)
    try:
        async with demo.transaction():
            user = await repository.resolve_user(demo, DEV_KEY)
            assert user is not None
            await repository.set_user(demo, user.id)
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(SIMPSON_BAY))
            assert await demo.fetchval(
                "SELECT id FROM allyanna.tot_return_payments WHERE id = $1",
                payment_id,
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval(
                "SELECT amount FROM allyanna.tot_return_payments WHERE id = $1",
                payment_id,
            )
            assert Decimal(visible) == Decimal("4.00")
    finally:
        await demo.close()
