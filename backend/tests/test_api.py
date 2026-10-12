"""HTTP contract: async routes, decimal strings, and master-account switching."""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from allyanna.main import create_app
from allyanna.schemas import TotRequest

GREAT_BAY = "22222222-2222-4222-8222-222222222221"
SIMPSON_BAY = "22222222-2222-4222-8222-222222222222"
OTHER_TENANT = "22222222-2222-4222-8222-222222222223"
DEMO_USER = "33333333-3333-4333-8333-333333333333"
DEV_KEY = "allyanna-dev-key"
OTHER_KEY = "allyanna-other-key"


def _auth(key: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {key}"}


def test_health_and_money_schema_without_a_database(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    app = create_app()
    with TestClient(app) as test_client:
        health = test_client.get("/api/v1/health")
        assert health.status_code == 200
        assert health.json() == {"status": "ok", "service": "allyanna"}
        schema = test_client.get("/openapi.json").json()
    assert schema["components"]["schemas"]["TotResponse"]["properties"]["tot_amount"]["type"] == "string"
    assert schema["components"]["schemas"]["TotResponse"]["properties"]["rate"]["type"] == "string"
    document_props = schema["components"]["schemas"]["DocumentIntakeResponse"]["properties"]
    for field_name in ("subtotal", "tot_amount", "grand_total"):
        options = document_props[field_name]["anyOf"]
        assert any(option.get("type") == "string" for option in options)
    invoice_props = schema["components"]["schemas"]["InvoiceResponse"]["properties"]
    assert invoice_props["subtotal"]["type"] == "string"
    assert invoice_props["tot_amount"]["type"] == "string"
    assert invoice_props["grand_total"]["type"] == "string"
    worksheet_props = schema["components"]["schemas"]["TotWorksheetResponse"]["properties"]
    assert worksheet_props["subtotal"]["type"] == "string"
    assert worksheet_props["tot_amount"]["type"] == "string"
    assert worksheet_props["grand_total"]["type"] == "string"
    assert worksheet_props["rate"]["type"] == "string"
    return_props = schema["components"]["schemas"]["TotReturnResponse"]["properties"]
    assert return_props["subtotal"]["type"] == "string"
    assert return_props["tot_amount"]["type"] == "string"
    assert return_props["rate"]["type"] == "string"
    assert return_props["superseded"]["type"] == "boolean"
    payment_props = schema["components"]["schemas"]["TotPaymentResponse"]["properties"]
    assert payment_props["amount"]["type"] == "string"
    assert payment_props["tax_due"]["type"] == "string"
    assert payment_props["amount_paid"]["type"] == "string"
    assert payment_props["balance_due"]["type"] == "string"
    list_props = schema["components"]["schemas"]["TotPaymentListResponse"]["properties"]
    assert list_props["tax_due"]["type"] == "string"
    assert list_props["amount_paid"]["type"] == "string"
    assert list_props["balance_due"]["type"] == "string"
    balance_props = schema["components"]["schemas"]["TotBalanceListResponse"]["properties"]
    assert balance_props["tax_due"]["type"] == "string"
    assert balance_props["amount_paid"]["type"] == "string"
    assert balance_props["balance_due"]["type"] == "string"
    row_props = schema["components"]["schemas"]["TotReturnBalanceResponse"]["properties"]
    assert row_props["tax_due"]["type"] == "string"
    assert row_props["amount_paid"]["type"] == "string"
    assert row_props["balance_due"]["type"] == "string"
    assert row_props["past_due"]["type"] == "boolean"
    assert balance_props["past_due_balance"]["type"] == "string"
    assert balance_props["as_of"]["type"] == "string"
    refund_props = schema["components"]["schemas"]["TotRefundResponse"]["properties"]
    assert refund_props["amount"]["type"] == "string"
    assert refund_props["tax_due"]["type"] == "string"
    assert refund_props["amount_paid"]["type"] == "string"
    assert refund_props["balance_due"]["type"] == "string"
    statement_props = schema["components"]["schemas"]["TotStatementResponse"]["properties"]
    assert statement_props["tax_due"]["type"] == "string"
    assert statement_props["amount_paid"]["type"] == "string"
    assert statement_props["balance_due"]["type"] == "string"
    line_props = schema["components"]["schemas"]["TotStatementLineResponse"]["properties"]
    assert line_props["amount"]["type"] == "string"
    assert line_props["balance"]["type"] == "string"
    assert set(line_props["kind"]["enum"]) == {"payment", "refund"}
    year_props = schema["components"]["schemas"]["TotYearStatementResponse"]["properties"]
    assert year_props["tax_due"]["type"] == "string"
    assert year_props["amount_paid"]["type"] == "string"
    assert year_props["balance_due"]["type"] == "string"
    filing_props = schema["components"]["schemas"]["TotYearFilingResponse"]["properties"]
    assert filing_props["tax_due"]["type"] == "string"
    assert filing_props["amount_paid"]["type"] == "string"
    assert filing_props["balance_due"]["type"] == "string"
    assert filing_props["opening_balance"]["type"] == "string"
    assert filing_props["closing_balance"]["type"] == "string"
    summary_props = schema["components"]["schemas"]["TotAnnualSummaryResponse"]["properties"]
    assert summary_props["tax_due"]["type"] == "string"
    assert summary_props["amount_paid"]["type"] == "string"
    assert summary_props["balance_due"]["type"] == "string"
    assert summary_props["superseded"]["type"] == "boolean"
    amends_options = summary_props["amends_summary_id"]["anyOf"]
    assert any(option.get("type") == "string" and option.get("format") == "uuid" for option in amends_options)
    assert any(option.get("type") == "null" for option in amends_options)


def test_json_float_money_is_rejected() -> None:
    with pytest.raises(ValueError):
        TotRequest.model_validate(
            {"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": 10.5}
        )
    parsed = TotRequest.model_validate(
        {"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "10.50"}
    )
    assert parsed.gross_taxable_revenue == Decimal("10.50")


def test_missing_and_unknown_keys_are_unauthorized(client: TestClient) -> None:
    missing = client.get("/api/v1/context")
    unknown = client.get("/api/v1/context", headers=_auth("not-a-key"))
    assert missing.status_code == 401
    assert missing.json()["code"] == "unauthenticated"
    assert unknown.status_code == 401


def test_master_account_sees_only_its_business_profiles(client: TestClient) -> None:
    demo = client.get("/api/v1/context", headers=_auth(DEV_KEY))
    other = client.get("/api/v1/context", headers=_auth(OTHER_KEY))
    assert demo.status_code == 200
    assert other.status_code == 200
    demo_ids = {item["id"] for item in demo.json()["available_tenants"]}
    other_ids = {item["id"] for item in other.json()["available_tenants"]}
    assert demo_ids == {GREAT_BAY, SIMPSON_BAY}
    assert other_ids == {OTHER_TENANT}
    assert demo.json()["active_tenant"] is None or demo.json()["active_tenant"]["id"] in demo_ids


def test_switch_is_limited_to_the_caller_master_account(client: TestClient) -> None:
    denied = client.post(
        "/api/v1/context/switch",
        headers=_auth(DEV_KEY),
        json={"tenant_id": OTHER_TENANT},
    )
    assert denied.status_code == 403
    assert denied.json()["code"] == "tenant_access_denied"
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(DEV_KEY),
        json={"tenant_id": GREAT_BAY},
    )
    assert switched.status_code == 200
    body = switched.json()
    assert body["active_tenant"]["id"] == GREAT_BAY
    assert body["active_master_account"]["slug"] == "harbour-ledger"
    assert body["active_tenant"]["legal_name"] == "Great Bay Provisions N.V."


def test_tax_calculation_requires_a_business_profile(client: TestClient, admin_sql) -> None:
    admin_sql(
        f"DELETE FROM allyanna.user_active_contexts WHERE user_id = '{DEMO_USER}'"
    )
    response = client.post(
        "/api/v1/tax/tot",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "2000.00"},
    )
    assert response.status_code == 409
    assert response.json()["code"] == "tenant_context_required"


def test_tot_wage_and_szv_read_the_sxm_2026_tables(client: TestClient) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(DEV_KEY),
        json={"tenant_id": GREAT_BAY},
    )
    assert switched.status_code == 200
    schedules = client.get(
        "/api/v1/tax/schedules",
        headers=_auth(DEV_KEY),
        params={"tax_year": 2026, "country_code": "SXM"},
    )
    assert schedules.status_code == 200
    by_code = {item["schedule_code"]: item for item in schedules.json()["schedules"]}
    assert by_code["TOT"]["tot_rate"] == "0.05"
    assert [item["base_tax"] for item in by_code["WAGE_TAX"]["brackets"]][1] == "4571.95"
    aov = next(item for item in by_code["SZV"]["components"] if item["component_code"] == "AOV")
    assert aov["monthly_wage_ceiling"] == "10928.01"
    assert aov["annual_wage_ceiling"] == "132824.35"

    tot = client.post(
        "/api/v1/tax/tot",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "2000.00"},
    )
    assert tot.status_code == 200
    assert tot.json()["tot_amount"] == "100.00"
    assert tot.json()["rate"] == "0.05"
    assert tot.json()["tenant_id"] == GREAT_BAY
    assert isinstance(tot.json()["tot_amount"], str)

    wage = client.post(
        "/api/v1/tax/wage",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "taxable_wage": "50000.00"},
    )
    assert wage.status_code == 200
    assert wage.json()["tax_amount"] == "7256.75"
    assert wage.json()["applied_bracket"]["bracket_order"] == 2
    assert wage.json()["amount_period"] == "year"

    szv = client.post(
        "/api/v1/tax/szv",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_monthly_wage": "20000.00"},
    )
    assert szv.status_code == 200
    payload = szv.json()
    capped = {item["component_code"]: item for item in payload["components"]}
    assert capped["ZV"]["capped_wage"] == "10000.00"
    assert capped["ZV"]["employee_amount"] == "420.00"
    assert capped["ZV"]["employer_amount"] == "830.00"
    assert capped["OV"]["employer_rate_source"] == "statutory_default"
    assert capped["OV"]["employer_amount"] == "50.00"
    assert capped["AOV"]["capped_wage"] == "10928.01"
    assert capped["AOV"]["employee_amount"] == "655.68"
    assert capped["AOV"]["employer_amount"] == "764.96"
    assert capped["AWW"]["employee_amount"] == "54.64"
    assert payload["employee_total"] == "1130.32"
    assert payload["employer_total"] == "1699.60"
    groups = {item["group_code"]: item for item in payload["groups"]}
    assert groups["ZV_OV"]["employer_amount"] == "880.00"
    assert groups["AOV_AWW"]["employee_amount"] == "710.32"


def test_tenant_ov_rate_and_request_override_come_from_outside_the_formula(client: TestClient) -> None:
    switched = client.post(
        "/api/v1/context/switch",
        headers=_auth(DEV_KEY),
        json={"tenant_id": SIMPSON_BAY},
    )
    assert switched.status_code == 200
    assert switched.json()["active_tenant"]["ov_employer_rate"] == "0.02"
    profile = client.post(
        "/api/v1/tax/szv",
        headers=_auth(DEV_KEY),
        json={"tax_year": 2026, "country_code": "SXM", "gross_monthly_wage": "5000.00"},
    )
    assert profile.status_code == 200
    ov = next(item for item in profile.json()["components"] if item["component_code"] == "OV")
    assert ov["employer_rate_source"] == "tenant_profile"
    assert ov["employer_amount"] == "100.00"
    overridden = client.post(
        "/api/v1/tax/szv",
        headers=_auth(DEV_KEY),
        json={
            "tax_year": 2026,
            "country_code": "SXM",
            "gross_monthly_wage": "5000.00",
            "ov_employer_rate": "0.03",
        },
    )
    assert overridden.status_code == 200
    ov = next(item for item in overridden.json()["components"] if item["component_code"] == "OV")
    assert ov["employer_rate_source"] == "request"
    assert ov["employer_amount"] == "150.00"
    rejected = client.post(
        "/api/v1/tax/szv",
        headers=_auth(DEV_KEY),
        json={
            "tax_year": 2026,
            "country_code": "SXM",
            "gross_monthly_wage": "5000.00",
            "ov_employer_rate": "0.06",
        },
    )
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "invalid_ov_rate"


def test_tot_changes_when_the_stored_rate_changes(client: TestClient, admin_sql) -> None:
    client.post(
        "/api/v1/context/switch",
        headers=_auth(DEV_KEY),
        json={"tenant_id": GREAT_BAY},
    )
    admin_sql(
        """
        UPDATE allyanna.tot_rates
        SET rate = 0.07000000
        WHERE tax_schedule_id = 'a1000000-0000-4000-8000-000000000001'
        """
    )
    try:
        response = client.post(
            "/api/v1/tax/tot",
            headers=_auth(DEV_KEY),
            json={"tax_year": 2026, "country_code": "SXM", "gross_taxable_revenue": "2000.00"},
        )
        assert response.status_code == 200
        assert response.json()["rate"] == "0.07"
        assert response.json()["tot_amount"] == "140.00"
    finally:
        admin_sql(
            """
            UPDATE allyanna.tot_rates
            SET rate = 0.05000000
            WHERE tax_schedule_id = 'a1000000-0000-4000-8000-000000000001'
            """
        )


def test_inactive_tenant_cannot_be_selected(client: TestClient, admin_sql) -> None:
    admin_sql(
        """
        UPDATE allyanna.tenants
        SET status = 'inactive'
        WHERE id = '22222222-2222-4222-8222-222222222222'
        """
    )
    try:
        response = client.post(
            "/api/v1/context/switch",
            headers=_auth(DEV_KEY),
            json={"tenant_id": SIMPSON_BAY},
        )
        assert response.status_code == 403
        assert response.json()["code"] == "tenant_inactive"
    finally:
        admin_sql(
            """
            UPDATE allyanna.tenants
            SET status = 'active'
            WHERE id = '22222222-2222-4222-8222-222222222222'
            """
        )
