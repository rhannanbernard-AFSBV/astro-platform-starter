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
    "0.475",
    "41.67",
    "85.62",
    "2273.44",
    "3933.16",
    "4331.05",
    "4571.95",
    "10928.01",
    "132824.35",
    "14162.33",
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
        SRC / "allyanna" / "payroll" / "service.py",
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


def test_payroll_tables_force_row_level_security() -> None:
    sql = (Path(__file__).resolve().parents[1] / "db" / "migrations" / "003_payroll.sql").read_text(
        encoding="utf-8"
    )
    for table in ("payroll_runs", "payroll_lines", "payroll_szv_lines"):
        assert "tenant_id uuid NOT NULL" in sql
        assert f"ALTER TABLE allyanna.{table} ENABLE ROW LEVEL SECURITY;" in sql
        assert f"ALTER TABLE allyanna.{table} FORCE ROW LEVEL SECURITY;" in sql
    assert "0.475" not in sql
    assert "41.67" not in sql
    assert "GRANT SELECT, INSERT ON allyanna.payroll_runs TO allyanna_app;" in sql
    assert "GRANT UPDATE ON allyanna.payroll_runs" not in sql
