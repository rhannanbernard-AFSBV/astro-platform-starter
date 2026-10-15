"""Turnover tax accumulates posted invoices. Wage tax and SZV stay separate."""

from decimal import Decimal

from fastapi.testclient import TestClient

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
DEV_KEY = "allyanna-dev-key"


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def _switch(client: TestClient, key: str, tenant_id: str) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(key),
        json={"tenant_id": tenant_id},
    )
    assert switched.status_code == 200


def test_turnover_tax_uses_invoice_totals_not_wage_or_szv(client: TestClient) -> None:
    _switch(client, DEV_KEY, GREAT_BAY)
    priced = client.post(
        "/api/v1/tax/tot",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "200.00"},
    )
    assert priced.status_code == 200
    table_tax = priced.json()["tot_amount"]
    table_rate = priced.json()["rate"]
    assert table_tax == "10.00"
    assert isinstance(table_rate, str)

    wage = client.post(
        "/api/v1/tax/wage",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "taxable_wage": "10000.00"},
    )
    assert wage.status_code == 200
    assert Decimal(wage.json()["tax_amount"]) > Decimal("0")

    szv = client.post(
        "/api/v1/tax/szv",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_monthly_wage": "10000.00"},
    )
    assert szv.status_code == 200
    assert Decimal(szv.json()["employee_total"]) > Decimal("0")
    assert Decimal(szv.json()["employer_total"]) > Decimal("0")

    empty = client.post(
        "/api/v1/tax/tot/worksheet",
        headers=_auth(DEV_KEY),
        json={
            "period_start": "2026-09-20",
            "period_end": "2026-09-20",
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )
    assert empty.status_code == 200
    assert empty.json()["invoice_count"] == 0
    assert empty.json()["subtotal"] == "0.00"
    assert empty.json()["tot_amount"] == "0.00"
    assert empty.json()["rate"] == table_rate

    created = client.post(
        "/api/v1/invoices",
        headers=_auth(DEV_KEY),
        json={
            "vendor_name": "Invoice-only Goods",
            "invoice_number": "TOT-ONLY-SEP",
            "invoice_date": "2026-09-20",
            "tax_year": 2026,
            "country_code": "SXM",
            "lines": [{"description": "Goods", "quantity": "2", "unit_price": "100.00"}],
        },
    )
    assert created.status_code == 201
    assert created.json()["subtotal"] == "200.00"
    assert created.json()["tot_amount"] == table_tax
    assert created.json()["tot_rate"] == table_rate

    wage_again = client.post(
        "/api/v1/tax/wage",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "taxable_wage": "25000.00"},
    )
    assert wage_again.status_code == 200
    assert Decimal(wage_again.json()["tax_amount"]) > Decimal(wage.json()["tax_amount"])

    sheet = client.post(
        "/api/v1/tax/tot/worksheet",
        headers=_auth(DEV_KEY),
        json={
            "period_start": "2026-09-20",
            "period_end": "2026-09-20",
            "tax_year": 2026,
            "country_code": "SXM",
        },
    )
    assert sheet.status_code == 200
    body = sheet.json()
    assert body["invoice_count"] == 1
    assert body["subtotal"] == "200.00"
    assert body["tot_amount"] == table_tax
    assert body["rate"] == table_rate
    assert body["grand_total"] == "210.00"
    assert [row["invoice_date"] for row in body["invoices"]] == ["2026-09-20"]
    assert Decimal(body["tot_amount"]) == Decimal(body["subtotal"]) * Decimal(table_rate)
