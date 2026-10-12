"""Post a completed intake into the active business profile's invoice ledger."""

import base64
import json
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
OTHER_FIRM = UUID("11111111-1111-4111-8111-111111111112")
TOT_SCHEDULE = "a1000000-0000-4000-8000-000000000001"
QUEUED_DOCUMENT = "44444444-4444-4444-8444-444444444444"
DEMO_USER = "33333333-3333-4333-8333-333333333333"
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


def _printed(*, tot_amount: str = "10.75", grand_total: str = "225.75") -> ExtractedDocumentPayload:
    return ExtractedDocumentPayload.model_validate(
        {
            "vendor_name": "Philipsburg Market",
            "invoice_date": "2026-04-02",
            "subtotal": "215.00",
            "tot_amount": tot_amount,
            "grand_total": grand_total,
            "lines": [
                {
                    "description": "Rice",
                    "quantity": "2",
                    "unit_price": "100.00",
                    "line_total": "200.00",
                },
                {
                    "description": "Oil",
                    "quantity": "1.5",
                    "unit_price": "10.00",
                    "line_total": "15.00",
                },
            ],
        }
    )


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def _complete(client: TestClient, payload: ExtractedDocumentPayload) -> dict[str, object]:
    client.app.state.document_extractor = _ScriptedExtractor(payload)
    accepted = client.post(
        "/api/v1/documents",
        headers=_auth(DEV_KEY),
        files={"file": ("receipt.png", PNG_BYTES, "image/png")},
    )
    assert accepted.status_code == 202
    finished = client.get(f"/api/v1/documents/{accepted.json()['id']}", headers=_auth(DEV_KEY))
    assert finished.status_code == 200
    body = finished.json()
    assert body["status"] == "completed"
    return body


def _post(client: TestClient, key: str, document_id: str) -> object:
    return client.post(f"/api/v1/documents/{document_id}/invoice", headers=_auth(key))


def test_completed_intake_posts_recomputed_amounts(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    document = _complete(client, _printed(tot_amount="999.99", grand_total="1214.99"))
    posted = _post(client, DEV_KEY, str(document["id"]))
    assert posted.status_code == 201
    invoice = posted.json()
    assert invoice["tenant_id"] == GREAT_BAY
    assert invoice["document_intake_id"] == document["id"]
    assert invoice["vendor_name"] == "Philipsburg Market"
    assert invoice["invoice_date"] == "2026-04-02"
    assert invoice["invoice_number"] is None
    assert invoice["subtotal"] == "215.00"
    assert invoice["tot_rate"] == "0.05"
    assert invoice["tot_amount"] == "10.75"
    assert invoice["grand_total"] == "225.75"
    assert [line["line_total"] for line in invoice["lines"]] == ["200.00", "15.00"]
    assert isinstance(invoice["tot_amount"], str)
    assert "999.99" not in json.dumps(invoice)
    fetched = client.get(f"/api/v1/invoices/{invoice['id']}", headers=_auth(DEV_KEY))
    assert fetched.status_code == 200
    assert fetched.json()["document_intake_id"] == document["id"]
    again = _post(client, DEV_KEY, str(document["id"]))
    assert again.status_code == 409
    assert again.json()["code"] == "intake_already_posted"


def test_only_a_completed_intake_can_be_posted(client: TestClient, admin_sql) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    admin_sql(f"DELETE FROM allyanna.document_intakes WHERE id = '{QUEUED_DOCUMENT}'")
    admin_sql(
        "INSERT INTO allyanna.document_intakes ("
        "id, tenant_id, actor_user_id, status, source_filename, content_type, byte_size, content"
        ") VALUES ("
        f"'{QUEUED_DOCUMENT}', '{GREAT_BAY}', '{DEMO_USER}', "
        "'queued', 'receipt.png', 'image/png', 4, decode('74657374', 'hex'))"
    )
    refused = _post(client, DEV_KEY, QUEUED_DOCUMENT)
    assert refused.status_code == 422
    assert refused.json()["code"] == "invalid_document"


def test_posting_follows_the_tax_table(client: TestClient, admin_sql) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    document = _complete(client, _printed())
    admin_sql(
        "UPDATE allyanna.tot_rates SET rate = 0.07000000 "
        f"WHERE tax_schedule_id = '{TOT_SCHEDULE}'"
    )
    try:
        drifted = _post(client, DEV_KEY, str(document["id"]))
        assert drifted.status_code == 422
        assert drifted.json()["code"] == "invalid_document"
    finally:
        admin_sql(
            "UPDATE allyanna.tot_rates SET rate = 0.05000000 "
            f"WHERE tax_schedule_id = '{TOT_SCHEDULE}'"
        )
    posted = _post(client, DEV_KEY, str(document["id"]))
    assert posted.status_code == 201
    assert posted.json()["tot_amount"] == "10.75"
    assert posted.json()["grand_total"] == "225.75"


@pytest.mark.asyncio
async def test_another_firm_cannot_post_or_read_the_intake(
    client: TestClient,
    database_url: str,
) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    document = _complete(client, _printed())
    document_id = str(document["id"])

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling_post = _post(client, DEV_KEY, document_id)
    sibling_document = client.get(f"/api/v1/documents/{document_id}", headers=_auth(DEV_KEY))
    assert sibling_post.status_code == 404
    assert sibling_post.json()["code"] == "document_not_found"
    assert sibling_document.status_code == 404

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign_post = _post(client, OTHER_KEY, document_id)
    foreign_document = client.get(f"/api/v1/documents/{document_id}", headers=_auth(OTHER_KEY))
    assert foreign_post.status_code == 404
    assert foreign_post.json()["code"] == "document_not_found"
    assert foreign_document.status_code == 404
    assert client.get("/api/v1/invoices", headers=_auth(OTHER_KEY)).json()["invoices"] == []

    _switch(client, DEV_KEY, GREAT_BAY)
    posted = _post(client, DEV_KEY, document_id)
    assert posted.status_code == 201
    invoice_id = posted.json()["id"]

    _switch(client, DEV_KEY, SIMPSON_BAY)
    sibling_invoice = client.get(f"/api/v1/invoices/{invoice_id}", headers=_auth(DEV_KEY))
    sibling_list = client.get("/api/v1/invoices", headers=_auth(DEV_KEY))
    assert sibling_invoice.status_code == 404
    assert sibling_invoice.json()["code"] == "invoice_not_found"
    assert invoice_id not in {item["id"] for item in sibling_list.json()["invoices"]}

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign_invoice = client.get(f"/api/v1/invoices/{invoice_id}", headers=_auth(OTHER_KEY))
    foreign_list = client.get("/api/v1/invoices", headers=_auth(OTHER_KEY))
    assert foreign_invoice.status_code == 404
    assert foreign_invoice.json()["code"] == "invoice_not_found"
    assert invoice_id not in {item["id"] for item in foreign_list.json()["invoices"]}

    await _assert_ledger_rls(database_url, UUID(document_id), UUID(invoice_id))


async def _assert_ledger_rls(database_url: str, document_id: UUID, invoice_id: UUID) -> None:
    repository = TenancyRepository()
    other = await asyncpg.connect(database_url)
    try:
        async with other.transaction():
            user = await repository.resolve_user(other, OTHER_KEY)
            assert user is not None
            await repository.set_user(other, user.id)
            await repository.set_scope(other, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            assert await other.fetch(
                "SELECT id FROM allyanna.document_intakes WHERE id = $1",
                document_id,
            ) == []
            assert await other.fetch(
                "SELECT id FROM allyanna.invoices WHERE id = $1",
                invoice_id,
            ) == []
        with pytest.raises(asyncpg.RaiseError, match="does not belong to this tenant"):
            async with other.transaction():
                user = await repository.resolve_user(other, OTHER_KEY)
                assert user is not None
                await repository.set_user(other, user.id)
                await repository.set_scope(
                    other,
                    master_account_id=OTHER_FIRM,
                    tenant_id=UUID(OTHER_TENANT),
                )
                await other.execute(
                    """
                    INSERT INTO allyanna.invoices (
                      tenant_id, vendor_name, invoice_date, currency_code, tax_year,
                      country_code, tax_schedule_id, subtotal, tot_rate, tot_amount,
                      grand_total, document_intake_id
                    )
                    VALUES (
                      current_setting('allyanna.tenant_id', true)::uuid,
                      'Leaked', DATE '2026-04-02', 'XCG', 2026, 'SXM',
                      'a1000000-0000-4000-8000-000000000001',
                      215.00, 0.01000000, 2.15, 217.15, $1
                    )
                    """,
                    document_id,
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
                "SELECT id FROM allyanna.invoices WHERE id = $1",
                invoice_id,
            ) is None
            await repository.set_scope(demo, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            assert await demo.fetchval(
                "SELECT vendor_name FROM allyanna.invoices WHERE id = $1",
                invoice_id,
            ) == "Philipsburg Market"
    finally:
        await demo.close()
