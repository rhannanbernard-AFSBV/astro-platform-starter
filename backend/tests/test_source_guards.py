"""Keep statutory rates out of the calculation code."""

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src"
FORBIDDEN_IN_CODE = (
    "0.05",
    "0.050",
    "0.083",
    "0.042",
    "0.2625",
    "0.3375",
    "4571.95",
    "10928.01",
    "132824.35",
)


def test_python_sources_have_no_float_literals() -> None:
    offenders: list[str] = []
    for path in SRC.rglob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, float):
                offenders.append(f"{path}:{node.lineno}")
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "float":
                offenders.append(f"{path}:{node.lineno} float()")
    assert offenders == []


def test_calculation_modules_do_not_embed_statutory_rates() -> None:
    watched = [
        SRC / "allyanna" / "tax" / "calculate.py",
        SRC / "allyanna" / "tax" / "service.py",
        SRC / "allyanna" / "ocr" / "price.py",
        SRC / "allyanna" / "ocr" / "service.py",
        SRC / "allyanna" / "ocr" / "extractor.py",
        SRC / "allyanna" / "invoices" / "totals.py",
        SRC / "allyanna" / "invoices" / "service.py",
        SRC / "allyanna" / "worksheets" / "sum.py",
        SRC / "allyanna" / "worksheets" / "service.py",
        SRC / "allyanna" / "worksheets" / "repository.py",
        SRC / "allyanna" / "worksheets" / "returns.py",
        SRC / "allyanna" / "worksheets" / "payments.py",
        SRC / "allyanna" / "api.py",
    ]
    for path in watched:
        text = path.read_text(encoding="utf-8")
        found = [token for token in FORBIDDEN_IN_CODE if token in text]
        assert found == [], f"{path.name} contains {found}"


def test_schema_forces_row_level_security_on_tenant_tables() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "001_foundation.sql").read_text(
        encoding="utf-8"
    )
    for table in (
        "master_accounts",
        "master_account_members",
        "tenants",
        "user_active_contexts",
        "audit_logs",
    ):
        assert f"ALTER TABLE allyanna.{table} ENABLE ROW LEVEL SECURITY;" in sql
        assert f"ALTER TABLE allyanna.{table} FORCE ROW LEVEL SECURITY;" in sql
    assert "GRANT INSERT, UPDATE, DELETE ON allyanna.tot_rates" not in sql
    assert "GRANT SELECT ON allyanna.tot_rates TO allyanna_app;" in sql


def test_document_tables_force_row_level_security() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "004_document_intakes.sql").read_text(
        encoding="utf-8"
    )
    for table in ("document_intakes", "document_intake_lines"):
        assert "tenant_id uuid NOT NULL" in sql
        assert f"ALTER TABLE allyanna.{table} ENABLE ROW LEVEL SECURITY;" in sql
        assert f"ALTER TABLE allyanna.{table} FORCE ROW LEVEL SECURITY;" in sql
    assert "0.05" not in sql
    assert "GRANT UPDATE ON allyanna.document_intake_lines" not in sql


def test_invoice_tables_force_row_level_security() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "002_invoices.sql").read_text(
        encoding="utf-8"
    )
    for table in ("invoices", "invoice_lines"):
        assert "tenant_id uuid NOT NULL" in sql
        assert f"ALTER TABLE allyanna.{table} ENABLE ROW LEVEL SECURITY;" in sql
        assert f"ALTER TABLE allyanna.{table} FORCE ROW LEVEL SECURITY;" in sql
    assert "0.05" not in sql


def test_worksheet_query_is_scoped_to_the_active_tenant() -> None:
    text = (SRC / "allyanna" / "worksheets" / "repository.py").read_text(encoding="utf-8")
    assert "tenant_id = current_setting('allyanna.tenant_id', true)::uuid" in text


def test_tot_return_table_forces_row_level_security() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "006_tot_returns.sql").read_text(
        encoding="utf-8"
    )
    assert "tenant_id uuid NOT NULL" in sql
    assert "ALTER TABLE allyanna.tot_returns ENABLE ROW LEVEL SECURITY;" in sql
    assert "ALTER TABLE allyanna.tot_returns FORCE ROW LEVEL SECURITY;" in sql
    assert "GRANT UPDATE ON allyanna.tot_returns" not in sql
    assert "0.05" not in sql


def test_annual_summary_amendment_keeps_the_earlier_row() -> None:
    sql = (
        Path(__file__).resolve().parents[1] / "db" / "migrations" / "014_tot_annual_summary_amendments.sql"
    ).read_text(encoding="utf-8")
    assert "amends_summary_id uuid" in sql
    assert "WHERE amends_summary_id IS NULL" in sql
    assert "tot_annual_summaries_amends_unique" in sql
    assert "user_can_access_tenant(NEW.tenant_id)" in sql
    assert "amendment does not belong to this tenant summary" in sql
    assert "GRANT UPDATE ON allyanna.tot_annual_summaries" not in sql
    assert "0.05" not in sql
    text = (SRC / "allyanna" / "worksheets" / "summaries.py").read_text(encoding="utf-8")
    assert "tenant_id = current_setting('allyanna.tenant_id', true)::uuid" in text
    assert "later.amends_summary_id = filed.id" in text


def test_annual_summary_freezes_the_year_without_a_rate() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "013_tot_annual_summary.sql").read_text(
        encoding="utf-8"
    )
    assert "tenant_id uuid NOT NULL" in sql
    assert "ALTER TABLE allyanna.tot_annual_summaries ENABLE ROW LEVEL SECURITY;" in sql
    assert "ALTER TABLE allyanna.tot_annual_summaries FORCE ROW LEVEL SECURITY;" in sql
    assert "GRANT UPDATE ON allyanna.tot_annual_summaries" not in sql
    assert "balance_due = tax_due - amount_paid" in sql
    assert "user_can_access_tenant(NEW.tenant_id)" in sql
    assert "0.05" not in sql
    text = (SRC / "allyanna" / "worksheets" / "summaries.py").read_text(encoding="utf-8")
    assert "tenant_id = current_setting('allyanna.tenant_id', true)::uuid" in text


def test_statement_balance_is_decimal_and_keeps_both_rows() -> None:
    text = (SRC / "allyanna" / "worksheets" / "service.py").read_text(encoding="utf-8")
    assert "def _running_lines(" in text
    assert "money(balance - posted)" in text
    assert "money(balance + posted)" in text
    assert "money(opening + tax_due)" in text
    assert "row.return_id not in superseded_ids" in text
    assert "0.05" not in text
    payments = (SRC / "allyanna" / "worksheets" / "payments.py").read_text(encoding="utf-8")
    refunds = (SRC / "allyanna" / "worksheets" / "refunds.py").read_text(encoding="utf-8")
    assert "tenant_id = current_setting('allyanna.tenant_id', true)::uuid" in payments
    assert "tenant_id = current_setting('allyanna.tenant_id', true)::uuid" in refunds


def test_tot_refund_reduces_amount_paid_without_removing_the_payment() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "012_tot_return_refunds.sql").read_text(
        encoding="utf-8"
    )
    assert "tenant_id uuid NOT NULL" in sql
    assert "ALTER TABLE allyanna.tot_return_refunds ENABLE ROW LEVEL SECURITY;" in sql
    assert "ALTER TABLE allyanna.tot_return_refunds FORCE ROW LEVEL SECURITY;" in sql
    assert "GRANT UPDATE ON allyanna.tot_return_refunds" not in sql
    assert "refund exceeds the amount paid" in sql
    assert "prior_tenant <> NEW.tenant_id" in sql
    assert "0.05" not in sql
    text = (SRC / "allyanna" / "worksheets" / "refunds.py").read_text(encoding="utf-8")
    assert "tenant_id = current_setting('allyanna.tenant_id', true)::uuid" in text


def test_tot_payment_table_forces_row_level_security() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "007_tot_return_payments.sql").read_text(
        encoding="utf-8"
    )
    assert "tenant_id uuid NOT NULL" in sql
    assert "ALTER TABLE allyanna.tot_return_payments ENABLE ROW LEVEL SECURITY;" in sql
    assert "ALTER TABLE allyanna.tot_return_payments FORCE ROW LEVEL SECURITY;" in sql
    assert "GRANT UPDATE ON allyanna.tot_return_payments" not in sql
    assert "0.05" not in sql
    text = (SRC / "allyanna" / "worksheets" / "payments.py").read_text(encoding="utf-8")
    assert "tenant_id = current_setting('allyanna.tenant_id', true)::uuid" in text
    assert "payments.tenant_id = returns.tenant_id" in text
    assert "COALESCE(SUM(payments.amount), 0::numeric)" in text


def test_return_amendment_keeps_the_earlier_filing() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "010_tot_return_amendments.sql").read_text(
        encoding="utf-8"
    )
    assert "amends_return_id uuid" in sql
    assert "prior_tenant <> NEW.tenant_id" in sql
    assert "GRANT UPDATE ON allyanna.tot_returns" not in sql
    assert "0.05" not in sql


def test_return_due_date_is_not_a_rate() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "009_return_due_date.sql").read_text(
        encoding="utf-8"
    )
    assert "due_on date" in sql
    assert "due_on IS NULL OR due_on >= period_end" in sql
    assert "0.05" not in sql


def test_correcting_invoice_targets_the_latest_filing() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "011_correcting_invoice.sql").read_text(
        encoding="utf-8"
    )
    assert "corrects_return_id uuid" in sql
    assert "invoices_one_correction_per_return" in sql
    assert "prior_tenant <> NEW.tenant_id" in sql
    assert "correcting invoice does not belong to this tenant return" in sql
    assert "invoice date falls in a filed period" in sql
    assert "GRANT UPDATE ON allyanna.invoices" not in sql
    assert "0.05" not in sql


def test_filed_period_blocks_a_new_invoice() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "008_filed_period.sql").read_text(
        encoding="utf-8"
    )
    assert "invoice date falls in a filed period" in sql
    assert "tenant_id = NEW.tenant_id" in sql
    assert "country_code = NEW.country_code" in sql
    assert "0.05" not in sql
    text = (SRC / "allyanna" / "invoices" / "repository.py").read_text(encoding="utf-8")
    assert "tenant_id = current_setting('allyanna.tenant_id', true)::uuid" in text
    assert "period_start <= $2" in text


def test_posted_intake_stays_on_the_invoice_tenant() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "005_post_intake.sql").read_text(
        encoding="utf-8"
    )
    assert "document_intake_id" in sql
    assert "tenant_id = NEW.tenant_id" in sql
    assert "status = 'completed'" in sql
    assert "invoices_document_intake_idx" in sql
    assert "0.05" not in sql
