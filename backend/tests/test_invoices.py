"""Invoice documents stay on the active business profile."""

from uuid import UUID

import asyncpg
import pytest
from fastapi.testclient import TestClient

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


def _body(number: str, *, unit_price: str = "100.00", quantity: str = "2") -> dict[str, object]:
    return {
        "vendor_name": "Philipsburg Supplies N.V.",
        "invoice_number": number,
        "invoice_date": "2026-03-15",
        "due_date": "2026-04-15",
        "tax_year": 2026,
        "country_code": "SXM",
        "lines": [
            {"description": "Dry goods", "quantity": quantity, "unit_price": unit_price},
            {"description": "Produce", "quantity": "1.5", "unit_price": "10.00"},
        ],
    }


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    response = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert response.status_code == 200


def test_invoice_requires_an_active_profile(client: TestClient, admin_sql) -> None:
    admin_sql(f"DELETE FROM allyanna.user_active_contexts WHERE user_id = '{DEMO_USER}'")
    response = client.post("/api/v1/invoices", headers=_auth(DEV_KEY), json=_body("INV-NONE"))
    assert response.status_code == 409
    assert response.json()["code"] == "tenant_context_required"


def test_recorded_invoice_uses_the_tot_table(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post("/api/v1/invoices", headers=_auth(DEV_KEY), json=_body("INV-215"))
    assert created.status_code == 201
    body = created.json()
    assert body["tenant_id"] == GREAT_BAY
    assert body["vendor_name"] == "Philipsburg Supplies N.V."
    assert body["invoice_date"] == "2026-03-15"
    assert body["due_date"] == "2026-04-15"
    assert body["subtotal"] == "215.00"
    assert body["tot_rate"] == "0.05"
    assert body["tot_amount"] == "10.75"
    assert body["grand_total"] == "225.75"
    assert [line["line_total"] for line in body["lines"]] == ["200.00", "15.00"]
    assert isinstance(body["tot_amount"], str)
    fetched = client.get(f"/api/v1/invoices/{body['id']}", headers=_auth(DEV_KEY))
    assert fetched.status_code == 200
    assert fetched.json()["grand_total"] == "225.75"
    listed = client.get("/api/v1/invoices", headers=_auth(DEV_KEY))
    assert listed.status_code == 200
    assert any(item["id"] == body["id"] for item in listed.json()["invoices"])


def test_duplicate_number_and_float_amounts_are_rejected(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    first = client.post("/api/v1/invoices", headers=_auth(DEV_KEY), json=_body("INV-DUP"))
    assert first.status_code == 201
    second = client.post("/api/v1/invoices", headers=_auth(DEV_KEY), json=_body("INV-DUP"))
    assert second.status_code == 409
    assert second.json()["code"] == "duplicate_invoice_number"
    floated = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "Float Vendor",
            "invoice_date": "2026-03-15",
            "tax_year": 2026,
            "lines": [{"description": "Item", "quantity": 1.5, "unit_price": "10.00"}],
        },
    )
    assert floated.status_code == 422


def test_tot_on_the_invoice_follows_the_stored_rate(client: TestClient, admin_sql) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    admin_sql(
        """
        UPDATE allyanna.tot_rates
        SET rate = 0.07000000
        WHERE tax_schedule_id = 'a1000000-0000-4000-8000-000000000001'
        """
    )
    try:
        created = client.post(
            "/api/v1/invoices",
            headers=_auth(DEV_KEY),
            json={
                "vendor_name": "Rate Check",
                "invoice_number": "INV-RATE",
                "invoice_date": "2026-05-01",
                "tax_year": 2026,
                "country_code": "SXM",
                "lines": [{"description": "Goods", "quantity": "1", "unit_price": "200.00"}],
            },
        )
        assert created.status_code == 201
        assert created.json()["tot_rate"] == "0.07"
        assert created.json()["subtotal"] == "200.00"
        assert created.json()["tot_amount"] == "14.00"
        assert created.json()["grand_total"] == "214.00"
    finally:
        admin_sql(
            """
            UPDATE allyanna.tot_rates
            SET rate = 0.05000000
            WHERE tax_schedule_id = 'a1000000-0000-4000-8000-000000000001'
            """
        )


@pytest.mark.asyncio
async def test_another_firm_cannot_read_the_invoice(client: TestClient, database_url: str) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    created = client.post("/api/v1/invoices", headers=_auth(DEV_KEY), json=_body("INV-FIRM"))
    assert created.status_code == 201
    invoice_id = created.json()["id"]
    vendor = created.json()["vendor_name"]

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling_get = client.get(f"/api/v1/invoices/{invoice_id}", headers=_auth(DEV_KEY))
    sibling_list = client.get("/api/v1/invoices", headers=_auth(DEV_KEY))
    assert sibling_get.status_code == 404
    assert vendor not in {item["vendor_name"] for item in sibling_list.json()["invoices"]}

    _switch(client, OTHER_KEY, OTHER_TENANT)
    other_get = client.get(f"/api/v1/invoices/{invoice_id}", headers=_auth(OTHER_KEY))
    other_list = client.get("/api/v1/invoices", headers=_auth(OTHER_KEY))
    assert other_get.status_code == 404
    assert other_get.json()["code"] == "invoice_not_found"
    assert other_list.json()["invoices"] == []

    await _assert_rls(database_url, UUID(invoice_id))


async def _assert_rls(database_url: str, invoice_id: UUID) -> None:
    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            leaked = await other.fetch("SELECT id FROM allyanna.invoices WHERE id = $1", invoice_id)
            assert leaked == []
        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
                await other.execute(
                    """
                    INSERT INTO allyanna.invoices (
                      tenant_id, vendor_name, invoice_date, currency_code, tax_year,
                      country_code, tax_schedule_id, subtotal, tot_rate, tot_amount, grand_total
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'Leaked', DATE '2026-01-01', 'XCG', 2026, 'SXM',
                      'a1000000-0000-4000-8000-000000000001',
                      1.00, 0.01000000, 0.01, 1.01
                    )
                    """
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
            hidden = await demo.fetch("SELECT id FROM allyanna.invoices WHERE id = $1", invoice_id)
            assert hidden == []
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await demo.fetchval("SELECT vendor_name FROM allyanna.invoices WHERE id = $1", invoice_id)
            assert visible == "Philipsburg Supplies N.V."
    finally:
        await demo.close()
