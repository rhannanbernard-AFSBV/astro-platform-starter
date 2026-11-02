"""Savory POS + Allyanna-compatible FastAPI entrypoint."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.pos import store
from app.pos.routes import router as pos_router


@asynccontextmanager
async def lifespan(_app: FastAPI):
    store.init_db()
    yield


app = FastAPI(
    title="Savory POS / Allyanna Backend",
    description=(
        "Production POS API: hashed PIN auth, durable SQLite/Postgres-ready store, "
        "immutable sales ledger, optional Stripe card intents. Designed to sit "
        "alongside Allyanna multi-tenant SXM compliance services."
    ),
    lifespan=lifespan,
)

origins = [
    o.strip()
    for o in os.getenv(
        "POS_CORS_ORIGINS",
        "http://localhost:4321,http://127.0.0.1:4321,http://localhost:3000",
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pos_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "savory-pos-api"}
