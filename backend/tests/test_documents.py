"""Async document intake. The model supplies printed fields. Python prices them."""

import base64
from uuid import UUID

import asyncpg
import pytest
from fastapi.testclient import TestClient

from allyanna.main import create_app
from allyanna.ocr.extractor import OpenAIDocumentExtractor
from allyanna.ocr.payload import ExtractedDocumentPayload
from allyanna.tenancy.repository import TenancyRepository

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
SIMPSON_BAY = "22222222-2222-4222-8222-222222222222"
OTHER_TENANT = "22222222-2222-4222-8222-222222222223"
DEMO_USER = UUID("33333333-3333-4333-8333-333333333333")
OTHER_USER = UUID("33333333-3333-4333-8333-333333333334")
HARBOUR = UUID("11111111-1111-4111-8111-111111111111")
OTHER_FIRM = UUID("11111111-1111-4111-8111-111111111112")
TOT_SCHEDULE = "a1000000-0000-4000-8000-000000000001"
DEV_KEY = "allyanna-dev-key"
OTHER_KEY = "allyanna-other-key"
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class _GuardExtractor:
    async def extract(self, *, content: bytes, content_type: str, filename: str) -> ExtractedDocumentPayload:
        raise AssertionError("tests must not call OpenAI")


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
        assert content
        assert content_type == "image/png"
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


@pytest.fixture
def client(database_url: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("TAX_CACHE_TTL_SECONDS", "0")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app = create_app()
    with TestClient(app) as test_client:
        test_client.app.state.document_extractor = _GuardExtractor()
        yield test_client


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def _upload(client: TestClient, payload: ExtractedDocumentPayload) -> dict[str, object]:
    client.app.state.document_extractor = _ScriptedExtractor(payload)
    accepted = client.post(
        "/api/v1/documents",
        headers=_auth(DEV_KEY),
        files={"file": ("receipt.png", PNG_BYTES, "image/png")},
    )
    assert accepted.status_code == 202
    body = accepted.json()
    assert body["status"] == "queued"
    assert body["subtotal"] is None
    finished = client.get(f"/api/v1/documents/{body['id']}", headers=_auth(DEV_KEY))
    assert finished.status_code == 200
    return finished.json()


def test_intake_recomputes_turnover_tax_from_the_table(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    body = _upload(client, _printed())
    assert body["status"] == "completed"
    assert body["tenant_id"] == GREAT_BAY
    assert body["vendor_name"] == "Philipsburg Market"
    assert body["invoice_date"] == "2026-04-02"
    assert body["currency_code"] == "XCG"
    assert body["tax_year"] == 2026
    assert body["country_code"] == "SXM"
    assert body["subtotal"] == "215.00"
    assert body["tot_amount"] == "10.75"
    assert body["grand_total"] == "225.75"
    assert body["tot_rate"] == "0.05"
    assert body["extracted_subtotal"] == "215.00"
    assert body["extracted_tot_amount"] == "10.75"
    assert body["extracted_grand_total"] == "225.75"
    assert body["amounts_match"] is True
    assert body["discrepancies"] == []
    assert isinstance(body["tot_amount"], str)
    assert [line["line_total"] for line in body["lines"]] == ["200.00", "15.00"]
    assert body["lines"][1]["quantity"] == "1.5"


def test_printed_tax_is_stored_beside_the_table_amount(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    body = _upload(client, _printed(tot_amount="999.99", grand_total="1214.99"))
    assert body["status"] == "completed"
    assert body["extracted_tot_amount"] == "999.99"
    assert body["tot_amount"] == "10.75"
    assert body["grand_total"] == "225.75"
    assert body["amounts_match"] is False
    assert any(item.startswith("tot_amount extracted 999.99") for item in body["discrepancies"])


def test_a_changed_table_rate_changes_the_recomputed_tax(client: TestClient, admin_sql) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    admin_sql(
        "UPDATE allyanna.tot_rates SET rate = 0.07000000 "
        f"WHERE tax_schedule_id = '{TOT_SCHEDULE}'"
    )
    try:
        body = _upload(client, _printed())
    finally:
        admin_sql(
            "UPDATE allyanna.tot_rates SET rate = 0.05000000 "
            f"WHERE tax_schedule_id = '{TOT_SCHEDULE}'"
        )
    assert body["status"] == "completed"
    assert body["subtotal"] == "215.00"
    assert body["tot_rate"] == "0.07"
    assert body["tot_amount"] == "15.05"
    assert body["grand_total"] == "230.05"
    assert body["extracted_tot_amount"] == "10.75"
    assert body["amounts_match"] is False


def test_missing_openai_key_fails_the_job_without_a_network_call(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    client.app.state.document_extractor = OpenAIDocumentExtractor(api_key=None)
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
    body = finished.json()
    assert body["status"] == "failed"
    assert "OPENAI_API_KEY" in body["error_message"]
    assert body["tot_amount"] is None
    assert body["subtotal"] is None


def test_upload_requires_a_business_profile_and_a_readable_file(
    client: TestClient,
    admin_sql,
) -> None:
    admin_sql(f"DELETE FROM allyanna.user_active_contexts WHERE user_id = '{DEMO_USER}'")
    missing = client.post(
        "/api/v1/documents",
        headers=_auth(DEV_KEY),
        files={"file": ("receipt.png", PNG_BYTES, "image/png")},
    )
    assert missing.status_code == 409
    assert missing.json()["code"] == "tenant_context_required"

    _switch(client, DEV_KEY, GREAT_BAY)
    wrong_type = client.post(
        "/api/v1/documents",
        headers=_auth(DEV_KEY),
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert wrong_type.status_code == 422
    assert wrong_type.json()["code"] == "invalid_document"
    empty = client.post(
        "/api/v1/documents",
        headers=_auth(DEV_KEY),
        files={"file": ("receipt.png", b"", "image/png")},
    )
    assert empty.status_code == 422
    assert empty.json()["code"] == "invalid_document"


def test_another_business_cannot_read_the_intake(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    body = _upload(client, _printed())
    document_id = body["id"]

    _switch(client, DEV_KEY, SIMPSON_BAY)
    hidden = client.get(f"/api/v1/documents/{document_id}", headers=_auth(DEV_KEY))
    assert hidden.status_code == 404
    assert hidden.json()["code"] == "document_not_found"
    sibling_list = client.get("/api/v1/documents", headers=_auth(DEV_KEY))
    assert sibling_list.status_code == 200
    assert document_id not in {item["id"] for item in sibling_list.json()["documents"]}

    _switch(client, OTHER_KEY, OTHER_TENANT)
    foreign = client.get(f"/api/v1/documents/{document_id}", headers=_auth(OTHER_KEY))
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "document_not_found"
    foreign_list = client.get("/api/v1/documents", headers=_auth(OTHER_KEY))
    assert foreign_list.status_code == 200
    assert document_id not in {item["id"] for item in foreign_list.json()["documents"]}


@pytest.mark.asyncio
async def test_row_level_security_hides_document_bytes(database_url: str, admin_sql) -> None:
    admin_sql("DELETE FROM allyanna.document_intakes")
    repository = TenancyRepository()
    conn = await asyncpg.connect(database_url)
    try:
        async with conn.transaction():
            await repository.set_user(conn, DEMO_USER)
            await repository.set_scope(conn, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            document_id = await conn.fetchval(
                """
                INSERT INTO allyanna.document_intakes (
                  tenant_id, actor_user_id, status, source_filename, content_type, byte_size, content
                )
                VALUES (
                  current_setting('allyanna.tenant_id', true)::uuid,
                  current_setting('allyanna.user_id', true)::uuid,
                  'queued', 'receipt.png', 'image/png', 4, $1
                )
                RETURNING id
                """,
                b"test",
            )

        async with conn.transaction():
            await repository.set_user(conn, OTHER_USER)
            await repository.set_scope(conn, master_account_id=OTHER_FIRM, tenant_id=UUID(GREAT_BAY))
            assert await conn.fetch("SELECT id FROM allyanna.document_intakes") == []

        with pytest.raises(asyncpg.InsufficientPrivilegeError):
            async with conn.transaction():
                await repository.set_user(conn, OTHER_USER)
                await repository.set_scope(
                    conn,
                    master_account_id=OTHER_FIRM,
                    tenant_id=UUID(GREAT_BAY),
                )
                await conn.execute(
                    """
                    INSERT INTO allyanna.document_intakes (
                      tenant_id, actor_user_id, status, source_filename,
                      content_type, byte_size, content
                    )
                    VALUES ($1, $2, 'queued', 'receipt.png', 'image/png', 1, $3)
                    """,
                    UUID(GREAT_BAY),
                    OTHER_USER,
                    b"x",
                )

        async with conn.transaction():
            await repository.set_user(conn, DEMO_USER)
            await repository.set_scope(conn, master_account_id=HARBOUR, tenant_id=UUID(SIMPSON_BAY))
            assert await conn.fetch(
                "SELECT id FROM allyanna.document_intakes WHERE id = $1",
                document_id,
            ) == []

        async with conn.transaction():
            await repository.set_user(conn, DEMO_USER)
            await repository.set_scope(conn, master_account_id=HARBOUR, tenant_id=UUID(GREAT_BAY))
            visible = await conn.fetchval(
                "SELECT id FROM allyanna.document_intakes WHERE id = $1",
                document_id,
            )
            assert visible == document_id
    finally:
        await conn.close()
