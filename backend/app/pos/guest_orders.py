"""Public guest-order helpers — menu + place order into POS snapshot (no auth)."""

from __future__ import annotations

import time
from typing import Any
from uuid import uuid4

from app.pos import store

BEVERAGE_CATEGORIES = frozenset({"Drinks", "Wine", "Champagne", "Rum"})

# Fallback catalog when staff have not yet pushed a menu (keeps /order usable).
FALLBACK_MENU: list[dict[str, Any]] = [
    {
        "id": "jerk-chicken",
        "name": "Jerk Chicken",
        "description": "Yard-style scotch bonnet marinade, charcoal grill, rice & peas, plantain.",
        "category": "Mains",
        "priceCents": 2450,
        "image": "/menu/1.svg",
        "popular": True,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Jerk",
    },
    {
        "id": "jerk-pork",
        "name": "Jerk Pork",
        "description": "Bone-in pork shoulder, festival, house glaze.",
        "category": "Mains",
        "priceCents": 2680,
        "image": "/menu/3.svg",
        "popular": True,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Jerk",
    },
    {
        "id": "escovitch",
        "name": "Escovitch Fish",
        "description": "Fried snapper, pickled onion and scotch bonnet, bammy.",
        "category": "Mains",
        "priceCents": 2890,
        "image": "/menu/4.svg",
        "popular": True,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Seafood",
    },
    {
        "id": "curry-shrimp",
        "name": "Curry Shrimp",
        "description": "Gulf shrimp in coconut curry, white rice.",
        "category": "Mains",
        "priceCents": 2790,
        "image": "/menu/2.svg",
        "popular": False,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Seafood",
    },
    {
        "id": "ital-stew",
        "name": "Ital Stew",
        "description": "Coconut ital vegetables, dumpling, no salt flesh.",
        "category": "Mains",
        "priceCents": 1890,
        "image": "/menu/5.svg",
        "popular": False,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Ital",
    },
    {
        "id": "ackee-saltfish",
        "name": "Ackee & Saltfish",
        "description": "National plate, callaloo, boiled banana.",
        "category": "Mains",
        "priceCents": 2290,
        "image": "/menu/6.svg",
        "popular": True,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Ital",
    },
    {
        "id": "beef-patty",
        "name": "Beef Patty",
        "description": "Flaky turmeric crust, spiced beef.",
        "category": "Starters",
        "priceCents": 450,
        "image": "/menu/7.svg",
        "popular": True,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Patties",
    },
    {
        "id": "veg-patty",
        "name": "Veggie Patty",
        "description": "Callaloo and cabbage filling.",
        "category": "Starters",
        "priceCents": 400,
        "image": "/menu/8.svg",
        "popular": False,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Patties",
    },
    {
        "id": "sorrel",
        "name": "Sorrel Punch",
        "description": "Hibiscus, ginger, clove — chilled.",
        "category": "Drinks",
        "priceCents": 550,
        "image": "/menu/1.svg",
        "popular": True,
        "eightySixed": False,
        "modifierGroups": [],
        "guestCategory": "Drinks",
    },
]


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


def _is_beverage(item: dict[str, Any]) -> bool:
    return str(item.get("category") or "") in BEVERAGE_CATEGORIES


def _guest_category(item: dict[str, Any]) -> str:
    explicit = item.get("guestCategory")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    cat = str(item.get("category") or "Mains")
    if cat in BEVERAGE_CATEGORIES:
        return "Drinks"
    name = f"{item.get('name', '')} {item.get('description', '')}".lower()
    if "jerk" in name:
        return "Jerk"
    if any(w in name for w in ("fish", "shrimp", "seafood", "escovitch", "lobster")):
        return "Seafood"
    if any(w in name for w in ("ital", "ackee", "callaloo", "vegan")):
        return "Ital"
    if "patty" in name or "patties" in name:
        return "Patties"
    return cat


def public_menu(tenant_id: str | None = None) -> dict[str, Any]:
    tid = tenant_id or store.DEFAULT_TENANT_ID
    snap = store.get_snapshot(tid) or {}
    menu = list(snap.get("menu") or [])
    source = "pos"
    if not menu:
        menu = [dict(item) for item in FALLBACK_MENU]
        source = "fallback"
    settings = snap.get("settings") or {}
    restaurant = snap.get("restaurant") or {}
    items = []
    for raw in menu:
        if raw.get("eightySixed"):
            continue
        items.append(
            {
                "id": raw["id"],
                "name": raw.get("name") or "Item",
                "description": raw.get("description") or "",
                "tagline": (raw.get("description") or "")[:72],
                "category": _guest_category(raw),
                "posCategory": raw.get("category") or "Mains",
                "priceCents": int(raw.get("priceCents") or 0),
                "image": raw.get("image") or "/menu/1.svg",
                "popular": bool(raw.get("popular")),
            }
        )
    return {
        "source": source,
        "currency": {"usd": True, "xcgPerUsd": float(settings.get("xcgPerUsd") or 1.8)},
        "restaurant": {
            "name": restaurant.get("name") or "Authentic Jamaican Cuisine & Bar",
            "tagline": restaurant.get("tagline") or "",
        },
        "items": items,
        "payAtCounter": True,
    }


def _line_summary(lines: list[dict[str, Any]], menu_by_id: dict[str, dict[str, Any]]) -> str:
    parts = []
    for line in lines:
        item = menu_by_id.get(line.get("menuItemId") or "")
        name = (item or {}).get("name") or "Item"
        parts.append(f"{line.get('quantity', 1)}× {name}")
    return ", ".join(parts[:6])


def place_order(
    *,
    tenant_id: str | None,
    fulfillment: str,
    table_label: str | None,
    guest_name: str | None,
    lines: list[dict[str, Any]],
) -> dict[str, Any]:
    """Insert a guest check into the POS snapshot and fire tickets to kitchen/bar."""
    tid = tenant_id or store.DEFAULT_TENANT_ID
    snap = store.get_snapshot(tid)
    if not snap:
        raise ValueError("POS not initialized")

    if fulfillment not in ("table", "pickup"):
        raise ValueError("fulfillment must be table or pickup")
    if not lines:
        raise ValueError("Order needs at least one line")

    menu = list(snap.get("menu") or [])
    if not menu:
        menu = [dict(item) for item in FALLBACK_MENU]
        snap["menu"] = menu
    menu_by_id = {str(item["id"]): item for item in menu}

    normalized: list[tuple[dict[str, Any], int]] = []
    for raw in lines:
        mid = str(raw.get("menuItemId") or "")
        qty = int(raw.get("quantity") or 0)
        if qty < 1 or qty > 40:
            raise ValueError("Invalid quantity")
        item = menu_by_id.get(mid)
        if not item:
            raise ValueError(f"Unknown menu item: {mid}")
        if item.get("eightySixed"):
            raise ValueError(f"{item.get('name')} is 86'd")
        normalized.append((item, qty))

    now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    token = f"go_{uuid4().hex}"
    guest_id = _id("guest")
    display_name = (guest_name or "").strip() or "Guest"
    if fulfillment == "table":
        label = (table_label or "").strip() or "Guest table"
        if not label.lower().startswith("table") and not label.lower().startswith("guest"):
            label = f"Table {label}" if label.isdigit() else label
    else:
        label = f"Pickup · {display_name}"

    seq = int(snap.get("nextOrderSeq") or 1)
    order_number = f"G-{seq:04d}"
    snap["nextOrderSeq"] = seq + 1

    auto_fire = bool((snap.get("settings") or {}).get("autoFireDrinks", True))
    order_lines: list[dict[str, Any]] = []
    food_count = 0
    drink_count = 0
    for item, qty in normalized:
        beverage = _is_beverage(item)
        if beverage:
            drink_count += 1
            status = "queued" if auto_fire else "draft"
            course = "fire" if auto_fire else "hold"
            sent_at = now if auto_fire else None
            onum = order_number if auto_fire else None
        else:
            food_count += 1
            status = "queued"
            course = "fire"
            sent_at = now
            onum = order_number
        order_lines.append(
            {
                "id": _id("line"),
                "menuItemId": item["id"],
                "quantity": qty,
                "guestId": guest_id,
                "note": "Guest app",
                "modifiers": [],
                "kitchenStatus": status,
                "sentToKitchenAt": sent_at,
                "orderNumber": onum,
                "sentByStaffId": None,
                "courseFire": course,
                "bumpedAt": None,
                "bumpCount": 0,
                "unitPriceSnapshotCents": int(item.get("priceCents") or 0),
                "compReason": None,
            }
        )

    table = {
        "id": _id("table"),
        "label": label,
        "checkKind": "table",
        "status": "open",
        "lines": order_lines,
        "guests": [{"id": guest_id, "name": display_name, "paidAt": None, "payment": None}],
        "tipAmountPreset": 0,
        "tipCents": 0,
        "serviceChargeEnabled": True,
        "serviceChargePercent": int(
            (snap.get("settings") or {}).get("defaultServiceChargePercent") or 5
        ),
        "billGeneratedAt": None,
        "paidAt": None,
        "payment": None,
        "guestSignatureDataUrl": None,
        "guestPreferredPayment": None,
        "guestBillApprovedAt": None,
        "guestOrderToken": token,
        "guestFulfillment": fulfillment,
        "source": "guest_app",
    }

    tables = list(snap.get("tables") or [])
    tables.append(table)
    snap["tables"] = tables
    # Do not steal active table from floor staff mid-service
    notifications = list(snap.get("notifications") or [])
    summary = _line_summary(order_lines, menu_by_id)
    if food_count:
        notifications.insert(
            0,
            {
                "id": _id("notif"),
                "kind": "kitchen_ticket",
                "title": "Guest app · kitchen",
                "message": f"{label} · {order_number} · {summary}",
                "orderNumber": order_number,
                "tableLabel": label,
                "audienceRole": "kitchen",
                "targetStaffId": None,
                "createdAt": now,
                "readBy": [],
            },
        )
    if drink_count and auto_fire:
        notifications.insert(
            0,
            {
                "id": _id("notif"),
                "kind": "bar_ticket",
                "title": "Guest app · bar",
                "message": f"{label} · {order_number} · drinks fired",
                "orderNumber": order_number,
                "tableLabel": label,
                "audienceRole": "bartender",
                "targetStaffId": None,
                "createdAt": now,
                "readBy": [],
            },
        )
    snap["notifications"] = notifications[:200]
    snap["updatedAt"] = int(time.time() * 1000)

    expected = snap.get("_revision")
    store.put_snapshot(tid, snap, expected_revision=expected)

    return order_status_payload(table, menu_by_id, token=token, order_number=order_number)


def find_order_by_token(tenant_id: str | None, token: str) -> dict[str, Any] | None:
    tid = tenant_id or store.DEFAULT_TENANT_ID
    snap = store.get_snapshot(tid) or {}
    menu_by_id = {str(item["id"]): item for item in (snap.get("menu") or [])}
    if not menu_by_id:
        menu_by_id = {str(item["id"]): item for item in FALLBACK_MENU}
    for table in snap.get("tables") or []:
        if table.get("guestOrderToken") == token:
            return order_status_payload(table, menu_by_id, token=token)
    return None


def order_status_payload(
    table: dict[str, Any],
    menu_by_id: dict[str, dict[str, Any]],
    *,
    token: str,
    order_number: str | None = None,
) -> dict[str, Any]:
    lines_out = []
    statuses: list[str] = []
    for line in table.get("lines") or []:
        item = menu_by_id.get(str(line.get("menuItemId") or ""))
        st = str(line.get("kitchenStatus") or "draft")
        statuses.append(st)
        lines_out.append(
            {
                "id": line.get("id"),
                "name": (item or {}).get("name") or "Item",
                "quantity": int(line.get("quantity") or 1),
                "status": st,
                "priceCents": int(
                    line.get("unitPriceSnapshotCents")
                    or (item or {}).get("priceCents")
                    or 0
                ),
            }
        )
    if table.get("status") == "paid" or table.get("paidAt"):
        phase = "paid"
    elif statuses and all(s == "served" for s in statuses):
        phase = "ready"
    elif any(s in ("preparing", "ready", "served") for s in statuses):
        phase = "preparing"
    elif any(s == "queued" for s in statuses):
        phase = "received"
    else:
        phase = "received"

    onum = order_number
    if not onum:
        for line in table.get("lines") or []:
            if line.get("orderNumber"):
                onum = line["orderNumber"]
                break

    return {
        "token": token,
        "orderNumber": onum,
        "label": table.get("label"),
        "fulfillment": table.get("guestFulfillment") or "table",
        "guestName": (table.get("guests") or [{}])[0].get("name"),
        "phase": phase,
        "payAtCounter": True,
        "tableStatus": table.get("status"),
        "lines": lines_out,
    }
