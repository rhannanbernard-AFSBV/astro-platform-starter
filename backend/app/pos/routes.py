"""HTTP routes for production POS API."""

from __future__ import annotations

import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.pos import payments as pay
from app.pos import store
from app.pos.store import ConflictError, DEFAULT_TENANT_ID

router = APIRouter(prefix="/pos", tags=["pos"])


class LoginBody(BaseModel):
    pin: str = Field(min_length=4, max_length=8)
    tenantId: Optional[str] = None


class SnapshotPutBody(BaseModel):
    state: dict[str, Any]
    expectedRevision: Optional[int] = None


class SaleBody(BaseModel):
    sale: dict[str, Any]


class VoidSaleBody(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class AuditBody(BaseModel):
    entry: dict[str, Any]


class CreateStaffBody(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    role: str
    pin: str = Field(min_length=4, max_length=8)
    initials: str = Field(min_length=1, max_length=4)


class CardIntentBody(BaseModel):
    amountCents: int = Field(gt=0)
    currency: str = "usd"
    tableLabel: Optional[str] = None
    guestName: Optional[str] = None


class BootstrapBody(BaseModel):
    menu: list[dict[str, Any]]
    tables: list[dict[str, Any]] = Field(default_factory=list)


def _bearer(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization")
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid Authorization")
    return parts[1].strip()


async def require_session(
    authorization: Optional[str] = Header(default=None),
) -> dict[str, Any]:
    token = _bearer(authorization)
    session = store.resolve_session(token)
    if not session:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Session expired or invalid")
    return {**session, "token": token}


def _require_manager(session: dict[str, Any]) -> None:
    if session["staff"]["role"] not in ("manager", "admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Manager or admin required")


@router.get("/health")
async def pos_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "savory-pos",
        "stripeConfigured": pay.stripe_enabled(),
        "defaultTenantId": DEFAULT_TENANT_ID,
        "mode": "server",
    }


@router.post("/auth/login")
async def login(body: LoginBody) -> dict[str, Any]:
    tenant_id = body.tenantId or DEFAULT_TENANT_ID
    if not body.pin.isdigit():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="PIN must be digits")
    result = store.authenticate(tenant_id, body.pin)
    if not result:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid PIN")
    return result


@router.post("/auth/logout")
async def logout(session: dict[str, Any] = Depends(require_session)) -> dict[str, str]:
    store.revoke_session(session["token"])
    return {"status": "ok"}


@router.get("/auth/me")
async def me(session: dict[str, Any] = Depends(require_session)) -> dict[str, Any]:
    return {
        "staff": session["staff"],
        "tenantId": session["tenantId"],
        "stripeConfigured": pay.stripe_enabled(),
    }


@router.get("/state")
async def get_state(session: dict[str, Any] = Depends(require_session)) -> dict[str, Any]:
    snap = store.get_snapshot(session["tenantId"])
    if not snap:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No POS state")
    return {"state": snap, "revision": snap.get("_revision", 1)}


@router.put("/state")
async def put_state(
    body: SnapshotPutBody,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    try:
        snap = store.put_snapshot(
            session["tenantId"],
            body.state,
            expected_revision=body.expectedRevision,
        )
    except ConflictError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "message": "State conflict — reload and retry",
                "revision": exc.revision,
                "updatedAt": exc.updated_at,
            },
        ) from exc
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No POS state") from exc
    return {"state": snap, "revision": snap.get("_revision", 1)}


@router.post("/bootstrap")
async def bootstrap(
    body: BootstrapBody,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    """Seed menu/tables once when server snapshot is empty."""
    snap = store.bootstrap_menu_if_empty(
        session["tenantId"], body.menu, body.tables
    )
    return {"state": snap, "revision": snap.get("_revision", 1)}


@router.post("/sales")
async def post_sale(
    body: SaleBody,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    if session["staff"]["role"] not in ("server", "admin", "manager"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not allowed to take payment")
    try:
        sale = store.record_sale(session["tenantId"], body.sale)
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return {"sale": sale}


@router.post("/sales/{sale_id}/void")
async def void_sale(
    sale_id: str,
    body: VoidSaleBody,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    if session["staff"]["role"] != "manager":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Manager required to void sales")
    try:
        sale = store.void_sale(
            session["tenantId"],
            sale_id,
            reason=body.reason.strip(),
            voided_by=session["staff"]["id"],
        )
    except KeyError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Sale not found") from exc
    except ValueError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return {"sale": sale}


@router.post("/audit")
async def post_audit(
    body: AuditBody,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    entry = {
        **body.entry,
        "staffId": session["staff"]["id"],
        "staffName": session["staff"]["name"],
    }
    saved = store.append_audit(session["tenantId"], entry)
    return {"entry": saved}


@router.get("/staff")
async def get_staff(session: dict[str, Any] = Depends(require_session)) -> dict[str, Any]:
    return {"staff": store.list_public_staff(session["tenantId"])}


@router.post("/staff")
async def post_staff(
    body: CreateStaffBody,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    _require_manager(session)
    if body.role not in ("kitchen", "server", "admin", "manager"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    if body.role == "manager" and session["staff"]["role"] != "manager":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only managers create managers")
    if not body.pin.isdigit():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="PIN must be digits")
    user = store.create_staff(
        session["tenantId"],
        name=body.name.strip(),
        role=body.role,
        pin=body.pin,
        initials=body.initials.strip().upper()[:4],
    )
    return {"staff": user}


@router.delete("/staff/{staff_id}")
async def delete_staff(
    staff_id: str,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, str]:
    _require_manager(session)
    if staff_id == session["staff"]["id"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate yourself")
    store.deactivate_staff(session["tenantId"], staff_id)
    return {"status": "ok"}


@router.post("/payments/card-intent")
async def card_intent(
    body: CardIntentBody,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    if not pay.stripe_enabled():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "message": "Stripe not configured",
                "hint": "Set STRIPE_SECRET_KEY for card rails, or record cash/manual card.",
                "stripeConfigured": False,
            },
        )
    try:
        intent = pay.create_card_intent(
            amount_cents=body.amountCents,
            currency=body.currency,
            metadata={
                "tenantId": session["tenantId"],
                "staffId": session["staff"]["id"],
                "tableLabel": body.tableLabel or "",
                "guestName": body.guestName or "",
            },
        )
    except Exception as exc:  # noqa: BLE001 — surface Stripe config/network errors
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
    return intent


@router.get("/payments/card-intent/{intent_id}")
async def card_intent_status(
    intent_id: str,
    session: dict[str, Any] = Depends(require_session),
) -> dict[str, Any]:
    del session  # auth only
    if not pay.stripe_enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe not configured")
    try:
        return pay.retrieve_intent(intent_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/config")
async def public_config() -> dict[str, Any]:
    """Unauthenticated bootstrap hints for the SPA."""
    origins = os.getenv("POS_CORS_ORIGINS", "")
    return {
        "defaultTenantId": DEFAULT_TENANT_ID,
        "stripeConfigured": pay.stripe_enabled(),
        "stripePublishableKey": os.getenv("PUBLIC_STRIPE_PUBLISHABLE_KEY")
        or os.getenv("STRIPE_PUBLISHABLE_KEY"),
        "corsOrigins": [o.strip() for o in origins.split(",") if o.strip()],
        "requiresLogin": True,
    }
