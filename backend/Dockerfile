FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    POS_DATA_DIR=/data \
    POS_FORCE_PIN_CHANGE=1 \
    POS_HIDE_DEMO_CREDENTIALS=1 \
    POS_SESSION_IDLE_MINUTES=30 \
    POS_PIN_MAX_ATTEMPTS=5 \
    POS_PIN_LOCKOUT_SECONDS=900

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY migrations ./migrations

RUN mkdir -p /data/backups

EXPOSE 8000

VOLUME ["/data"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
