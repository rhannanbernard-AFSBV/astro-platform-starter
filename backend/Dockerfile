# Allyanna Accounting — production FastAPI backend
# Multi-stage, python-slim, non-root, port 8000
# Build context: ./backend (requires app/, requirements.txt from Allyanna backend)

# ----- builder: resolve deps into a clean prefix -----
FROM python:3.12-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install -r requirements.txt

# ----- runtime: slim image, non-root -----
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    # Financial math stays in Python decimal (tax_engine); LLM is extract/route only.
    ALLYANNA_COUNTRY_CODE=SXM

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 allyanna \
    && useradd --system --uid 10001 --gid allyanna --home /app --shell /usr/sbin/nologin allyanna

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
COPY --chown=allyanna:allyanna app ./app
COPY --chown=allyanna:allyanna data ./data
COPY --chown=allyanna:allyanna migrations ./migrations

USER allyanna

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# Secrets (DATABASE_URL, OPENAI_API_KEY, JWT_SECRET, etc.) come from runtime env only.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
