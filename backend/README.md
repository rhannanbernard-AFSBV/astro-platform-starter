# Allyanna SXM Compliance Core (FastAPI)

Python FastAPI backend for Sint Maarten tax/compliance math (TOT, wage tax, SZV), chat routing, and async OCR extraction.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Optional: set `OPENAI_API_KEY` for live chat/OCR calls.

## Run API

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Tenant auth stub: send `X-Tenant-Id` + `X-User-Id` headers, or `Authorization: Bearer demo-tenant-token`.

## Tests

```bash
cd backend
source .venv/bin/activate
pytest -q
```
