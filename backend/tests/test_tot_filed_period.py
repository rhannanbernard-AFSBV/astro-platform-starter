"""A filed period rejects a later invoice so the stored tax stays fixed."""

import base64
from uuid import UUID

import asyncpg
import pytest
from fastapi.testclient import TestClient

from allyanna.ocr.payload import ExtractedDocumentPayload
from allyanna.tenancy.repository import TenancyRepository

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
SIMPSON_BAY = "22222222-2222-4222-8222-222222222222"
OTHER_TENANT = "22222222-2222-4222-8222-222222222223"
HARBOUR = UUID("11111111-1111-4111-8111-111111111111")
TOT_SCHEDULE = "a1000000-0000-4000-8000-000000000001"
DEV_KEY = "allyanna-dev-key"
OTHER_KEY = "allyanna-other-key"
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class _ScriptedExtractor:
    def __init__(self, payload: ExtractedDocumentPayload) -> None:
        self.payload = payload

    async def extract(
        self,
        *,
        content: bytes,
        content_type: str,
        filename: str,
    ) -> ExtractedDocumentPayload:
        return self.payload


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def _invoice(client: TestClient, key: str, number: str, invoice_date: str) -> object:
    return client.post(
        "/api/v1/invoices",
        headers=_auth(key),
        json={
            "vendor_name": "July Goods",
            "invoice_number": number,
            "invoice_date": invoice_date,
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )


def test_a_filed_period_rejects_a_new_invoice(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    original = _invoice(client, DEV_KEY, "LOCK-IN", "2026-07-10")
    assert original.status_code == 201
    filed = client.post(
        "/api/v1/tax/tot/returns",
        headers=_auth(DEV_KEY),
        json={
            "period_start": "2026-07-02",
            "period_end": "2026-07-14",
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )
    assert filed.status_code == 201
    frozen = filed.json()
    assert frozen["invoice_count"] == 1
    assert frozen["tot_amount"] == "10.00"
    assert frozen["grand_total"] == "210.00"
    return_id = frozen["id"]

    for number, invoice_date in (
        ("LOCK-MID", "2026-07-10"),
        ("LOCK-START", "2026-07-02"),
        ("LOCK-END", "2026-07-14"),
    ):
        rejected = _invoice(client, DEV_KEY, number, invoice_date)
        assert rejected.status_code == 409
        assert rejected.json()["code"] == "invoice_period_filed"

    before = _invoice(client, DEV_KEY, "LOCK-BEFORE", "2026-07-01")
    after = _invoice(client, DEV_KEY, "LOCK-AFTER", "2026-07-15")
    assert before.status_code == 201
    assert after.status_code == 201

    stored = client.get(f"/api/v1/tax/tot/returns/{return_id}", headers=_auth(DEV_KEY))
    assert stored.status_code == 200
    assert stored.json()["invoice_count"] == 1
    assert stored.json()["tot_amount"] == "10.00"
    balances = client.get("/api/v1/tax/tot/balances", headers=_auth(DEV_KEY))
    assert balances.status_code == 200
    row = next(item for item in balances.json()["returns"] if item["return_id"] == return_id)
    assert row["tax_due"] == "10.00"
    assert row["amount_paid"] == "0.00"
    assert row["balance_due"] == "10.00"

    outside = _invoice(client, DEV_KEY, "LOCK-INTAKE-AMT", "2026-07-16")
    assert outside.status_code == 201
    payload = ExtractedDocumentPayload.model_validate(
        {
            "vendor_name": "July Market",
            "invoice_date": "2026-07-10",
            "subtotal": outside.json()["subtotal"],
            "tot_amount": outside.json()["tot_amount"],
            "grand_total": outside.json()["grand_total"],
            "lines": [
                {
                    "description": "Goods",
                    "quantity": "2",
                    "unit_price": "100.00",
                    "line_total": "200.00",
                }
            ],
        }
    )
    client.app.state.document_extractor = _ScriptedExtractor(payload)
    accepted = client.post(
        "/api/v1/documents",
        headers=_auth(DEV_KEY),
        files={"file": ("receipt.png", PNG_BYTES, "image/png")},
    )
    assert accepted.status_code == 202
    finished = client.get(
        f"/api/v1/documents/{accepted.json()['id']}",
        headers=_auth(DEV_KEY),
    )
    assert finished.status_code == 200
    assert finished.json()["status"] == "completed"
    posted = client.post(
        f"/api/v1/documents/{accepted.json()['id']}/invoice",
        headers=_auth(DEV_KEY),
    )
    assert posted.status_code == 409
    assert posted.json()["code"] == "invoice_period_filed"

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling = _invoice(client, DEV_KEY, "LOCK-SIB", "2026-07-10")
    assert sibling.status_code == 201

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = _invoice(client, OTHER_KEY, "LOCK-FIRM", "2026-07-10")
    assert foreign.status_code == 201


@pytest.mark.asyncio
async def test_the_database_rejects_an_invoice_in_a_filed_period(
    client: TestClient,
    database_url: str,
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    filed = client.post(
        "/api/v1/tax/tot/returns",
        headers=_auth(DEV_KEY),
        json={
            "period_start": "2026-07-20",
            "period_end": "2026-07-25",
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )
    assert filed.status_code == 201
    assert filed.json()["tot_amount"] == "0.00"

    repository = TenancyRepository()
    demo = await asyncpg.connect(database_url)
    try:
        with pytest.raises(asyncpg.RaiseError, match="filed period"):
            async with demo.transaction():
                user = await repository.resolve_user(demo, DEV_KEY)
                assert user is not None
                await repository.set_user(demo, user.id)
                await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
                await demo.execute(
                    """
                    INSERT INTO allyanna.invoices (
                      tenant_id, vendor_name, invoice_date, currency_code, tax_year,
                      country_code, tax_schedule_id, subtotal, tot_rate, tot_amount, grand_total
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'Late', DATE '2026-07-22', 'XCG', 2026, 'SXM',
                      $1::uuid,
                      1.00, 0.01000000, 0.01, 1.01
                    )
                    """,
                    UUID(TOT_SCHEDULE),
                )
    finally:
        await demo.close()
