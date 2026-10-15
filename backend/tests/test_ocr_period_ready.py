"""OCR intake review and turnover-tax period readiness for the Tax Office path."""

import base64
from decimal import Decimal

from fastapi.testclient import TestClient

from allyanna.main import create_app
from allyanna.ocr.payload import ExtractedDocumentPayload

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
SIMPSON_BAY = "22222222-2222-4222-8222-222222222222"
OTHER_TENANT = "22222222-2222-4222-8222-222222222223"
DEV_KEY = "allyanna-dev-key"
OTHER_KEY = "allyanna-other-key"
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


class _GuardExtractor:
    async def extract(self, *, content: bytes, content_type: str, filename: str) -> object:
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


def _money(value: object) -> Decimal:
    assert isinstance(value, str)
    return Decimal(value)


def _printed(
    *,
    invoice_date: str = "2026-12-20",
    tot_amount: str = "5.00",
    grand_total: str = "105.00",
) -> ExtractedDocumentPayload:
    return ExtractedDocumentPayload.model_validate(
        {
            "vendor_name": "Cole Bay Supply",
            "invoice_date": invoice_date,
            "subtotal": "100.00",
            "tot_amount": tot_amount,
            "grand_total": grand_total,
            "lines": [
                {
                    "description": "Goods",
                    "quantity": "1",
                    "unit_price": "100.00",
                    "line_total": "100.00",
                }
            ],
        }
    )


def _upload(client: TestClient, payload: ExtractedDocumentPayload) -> dict[str, object]:
    client.app.state.document_extractor = _ScriptedExtractor(payload)
    accepted = client.post(
        "/api/v1/documents",
        headers=_auth(DEV_KEY),
        files={"file": ("receipt.png", PNG_BYTES, "image/png")},
    )
    assert accepted.status_code == 202
    finished = client.get(f"/api/v1/documents/{accepted.json()['id']}", headers=_auth(DEV_KEY))
    assert finished.status_code == 200
    return finished.json()


def test_intake_review_ready_mismatch_and_post_into_period_ready(
    database_url: str, monkeypatch
) -> None:
    # Use Simpson Bay so posted invoices do not alter Great Bay period filings.
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("TAX_CACHE_TTL_SECONDS", "0")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app = create_app()
    with TestClient(app) as client:
        client.app.state.document_extractor = _GuardExtractor()
        _switch(client, DEV_KEY, SIMPSON_BAY)
        ready_doc = _upload(client, _printed())
        mismatch = _upload(
            client,
            _printed(invoice_date="2026-12-21", tot_amount="99.00", grand_total="199.00"),
        )
        assert ready_doc["amounts_match"] is True
        assert mismatch["amounts_match"] is False
        assert ready_doc["tenant_id"] == SIMPSON_BAY

        reviews = client.get("/api/v1/documents/review", headers=_auth(DEV_KEY))
        assert reviews.status_code == 200
        body = reviews.json()
        assert body["tenant_id"] == SIMPSON_BAY
        by_id = {item["document_id"]: item for item in body["reviews"]}
        ready_row = by_id[ready_doc["id"]]
        blocked_row = by_id[mismatch["id"]]
        assert ready_row["ready_to_post"] is True
        assert ready_row["blocked_reason"] is None
        assert ready_row["post_path"] == f"/api/v1/documents/{ready_doc['id']}/invoice"
        assert ready_row["table_tot_amount"] == "5.00"
        assert ready_row["extracted_tot_amount"] == "5.00"
        assert blocked_row["ready_to_post"] is False
        assert blocked_row["blocked_reason"] == "amount_mismatch"
        assert blocked_row["post_path"] is None
        assert blocked_row["table_tot_amount"] == "5.00"
        assert blocked_row["extracted_tot_amount"] == "99.00"
        assert body["ready_count"] >= 1
        assert body["blocked_count"] >= 1

        single = client.get(
            f"/api/v1/documents/{ready_doc['id']}/review",
            headers=_auth(DEV_KEY),
        )
        assert single.status_code == 200
        assert single.json() == ready_row

        posted = client.post(ready_row["post_path"], headers=_auth(DEV_KEY))
        assert posted.status_code == 201
        assert posted.json()["tot_amount"] == "5.00"
        assert posted.json()["tenant_id"] == SIMPSON_BAY
        invoice_id = posted.json()["id"]

        after = client.get(
            f"/api/v1/documents/{ready_doc['id']}/review",
            headers=_auth(DEV_KEY),
        )
        assert after.status_code == 200
        assert after.json()["ready_to_post"] is False
        assert after.json()["blocked_reason"] == "already_posted"
        assert after.json()["invoice_id"] == invoice_id
        assert after.json()["post_path"] is None

        period = client.get(
            "/api/v1/tax/tot/period-ready",
            headers=_auth(DEV_KEY),
            params={"tax_year": 2026, "country_code": "SXM"},
        )
        assert period.status_code == 200
        ready_body = period.json()
        assert ready_body["tenant_id"] == SIMPSON_BAY
        assert ready_body["tax_year"] == 2026
        assert ready_body["country_code"] == "SXM"
        assert any(item["document_id"] == mismatch["id"] for item in ready_body["intakes_blocked"])
        assert ready_doc["id"] not in {
            item["document_id"] for item in ready_body["intakes_ready"]
        }
        unfiled_ids = {item["invoice_id"] for item in ready_body["unfiled_invoices"]}
        assert invoice_id in unfiled_ids
        unfiled = next(
            item for item in ready_body["unfiled_invoices"] if item["invoice_id"] == invoice_id
        )
        assert unfiled["tot_amount"] == "5.00"
        assert unfiled["document_intake_id"] == ready_doc["id"]
        assert _money(ready_body["unfiled_tot_amount"]) >= Decimal("5.00")

        _switch(client, DEV_KEY, GREAT_BAY)
        sibling = client.get("/api/v1/documents/review", headers=_auth(DEV_KEY))
        assert sibling.status_code == 200
        assert ready_doc["id"] not in {
            item["document_id"] for item in sibling.json()["reviews"]
        }
        sibling_period = client.get(
            "/api/v1/tax/tot/period-ready",
            headers=_auth(DEV_KEY),
            params={"tax_year": 2026, "country_code": "SXM"},
        )
        assert sibling_period.status_code == 200
        assert sibling_period.json()["tenant_id"] == GREAT_BAY
        assert invoice_id not in {
            item["invoice_id"] for item in sibling_period.json()["unfiled_invoices"]
        }

        _switch(client, OTHER_KEY, OTHER_TENANT)
        foreign = client.get("/api/v1/documents/review", headers=_auth(OTHER_KEY))
        assert foreign.status_code == 200
        assert ready_doc["id"] not in {
            item["document_id"] for item in foreign.json()["reviews"]
        }
        foreign_period = client.get(
            "/api/v1/tax/tot/period-ready",
            headers=_auth(OTHER_KEY),
            params={"tax_year": 2026, "country_code": "SXM"},
        )
        assert foreign_period.status_code == 200
        assert foreign_period.json()["tenant_id"] == OTHER_TENANT
        assert invoice_id not in {
            item["invoice_id"] for item in foreign_period.json()["unfiled_invoices"]
        }
