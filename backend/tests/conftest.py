"""Session database for row-level security and API tests."""

import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DATABASE_NAME = "allyanna_test"
APP_DSN = f"postgresql://allyanna_app:allyanna_app_dev@127.0.0.1:5432/{DATABASE_NAME}"


def _run(command: list[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def _postgres_ready() -> bool:
    if shutil.which("pg_isready") is None:
        return False
    if subprocess.run(["pg_isready", "-h", "127.0.0.1"], check=False).returncode == 0:
        return True
    subprocess.run(["sudo", "pg_ctlcluster", "16", "main", "start"], check=False)
    return subprocess.run(["pg_isready", "-h", "127.0.0.1"], check=False).returncode == 0


@pytest.fixture(scope="session")
def database_url() -> str:
    if not _postgres_ready():
        pytest.skip("PostgreSQL is not accepting connections")
    _run(
        [
            "sudo",
            "-u",
            "postgres",
            "psql",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            f"DROP DATABASE IF EXISTS {DATABASE_NAME} WITH (FORCE)",
        ]
    )
    _run(
        [
            "sudo",
            "-u",
            "postgres",
            "psql",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            f"CREATE DATABASE {DATABASE_NAME}",
        ]
    )
    for relative in (
        "db/000_role.sql",
        "db/migrations/001_foundation.sql",
        "db/seeds/001_sxm_2026.sql",
        "db/migrations/002_invoices.sql",
        "db/migrations/004_document_intakes.sql",
        "db/migrations/005_post_intake.sql",
        "db/migrations/006_tot_returns.sql",
        "db/migrations/007_tot_return_payments.sql",
        "db/migrations/008_filed_period.sql",
        "db/migrations/009_return_due_date.sql",
    ):
        _run(
            [
                "sudo",
                "-u",
                "postgres",
                "psql",
                "-d",
                DATABASE_NAME,
                "-v",
                "ON_ERROR_STOP=1",
                "-f",
                str(BACKEND_ROOT / relative),
            ]
        )
    return APP_DSN


def _admin_sql(statement: str) -> None:
    _run(
        [
            "sudo",
            "-u",
            "postgres",
            "psql",
            "-d",
            DATABASE_NAME,
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            statement,
        ]
    )


@pytest.fixture
def admin_sql() -> object:
    return _admin_sql


class _GuardExtractor:
    async def extract(self, *, content: bytes, content_type: str, filename: str) -> object:
        raise AssertionError("tests must not call OpenAI")


@pytest.fixture
def client(database_url: str, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("TAX_CACHE_TTL_SECONDS", "0")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from allyanna.main import create_app

    app = create_app()
    with TestClient(app) as test_client:
        test_client.app.state.document_extractor = _GuardExtractor()
        yield test_client
