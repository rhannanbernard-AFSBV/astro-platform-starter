"""GPT-4o menu enrichment — extraction/copy only; never computes money."""

from __future__ import annotations

import json
import os
from typing import Any, Literal, Optional

import httpx
from pydantic import BaseModel, Field


class MenuEnrichRequest(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    category: str = Field(min_length=1, max_length=40)
    description: str = ""
    origin: Optional[str] = None
    vintageYear: Optional[int] = None


class MenuEnrichResponse(BaseModel):
    description: str
    prepGuide: str
    pairingNotes: str
    ingredients: str
    source: Literal["gpt-4o", "local"]


def openai_configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def _local_enrich(body: MenuEnrichRequest) -> MenuEnrichResponse:
    """Deterministic professional copy when no API key (demo / offline)."""
    name = body.name.strip()
    cat = body.category.strip()
    origin = (body.origin or "").strip()
    year = body.vintageYear

    if cat in ("Wine", "Champagne"):
        ingredients = (
            f"{name}"
            + (f" · {origin}" if origin else "")
            + (f" · {year}" if year else "")
            + ". Bottled service — chill and pour to style."
        )
        prep = (
            "Present the label, open with care, pour a tasting ounce, then serve "
            "at correct temperature (sparkling/white chilled; red slightly cool)."
        )
        if cat == "Wine":
            pairing = (
                "Pair with Authentic Jamaican Cuisine: lighter whites with festival, "
                "ackee & saltfish, and milder jerk; fuller reds with oxtail stew and curry goat."
            )
        else:
            pairing = (
                "Pairs with festival & plantain, roasted breadfruit, ackee & saltfish, "
                "and celebration toasts before heavier stews."
            )
    elif cat in ("Rum", "Drinks"):
        ingredients = (
            f"{name}: measure spirits and fresh juices; ice; house garnish. "
            "Follow bar recipe cards — do not invent ABV."
        )
        prep = (
            f"Build {name} with a jigger. Shake or stir to style, strain into the "
            "correct glass, garnish, wipe the rim, serve on a napkin."
        )
        pairing = (
            "Serve as a bar round or alongside spicy mains (jerk, curry) as a cooling counterpoint; "
            "offer NA alternatives from the Drinks tab."
        )
    else:
        ingredients = (
            f"{name}: list proteins/produce, aromatics (onion, garlic, thyme), "
            "scotch bonnet to taste, salt — confirm allergens with the chef."
        )
        prep = (
            f"Cook {name} to ticket course-fire. Finish hot, plate clean, honor Prep/Side swap "
            "modifiers, and send only when the pass matches the ticket."
        )
        pairing = (
            "Suggest rum punch, sorrel, or a Wine List bottle matched to spice level."
        )

    description = body.description.strip() or (
        f"{name}"
        + (f" · {origin}" if origin else "")
        + (f" · {year}" if year else "")
    )
    return MenuEnrichResponse(
        description=description,
        prepGuide=prep,
        pairingNotes=pairing,
        ingredients=ingredients,
        source="local",
    )


async def enrich_menu_item(body: MenuEnrichRequest) -> MenuEnrichResponse:
    if not openai_configured():
        return _local_enrich(body)

    system = (
        "You are a senior restaurant beverage and kitchen writer for Authentic Jamaican "
        "Cuisine & Bar (Sint Maarten). Return ONLY valid JSON with keys: description, "
        "prepGuide, pairingNotes, ingredients. "
        "Rules: Never invent prices, tax, ABV percentages as facts, or do financial math. "
        "prepGuide = step-by-step professional prep/service. "
        "For Wine/Champagne, pairingNotes MUST name specific Jamaican meals that pair "
        "(jerk chicken, ackee & saltfish, curry goat, oxtail, festival, callaloo, etc.). "
        "ingredients = clear ingredient/component list. "
        "description = one short guest-facing sentence. "
        "Tone: clear, professional, yard-kitchen friendly."
    )
    user = {
        "name": body.name,
        "category": body.category,
        "description": body.description,
        "origin": body.origin,
        "vintageYear": body.vintageYear,
    }
    model = os.getenv("OPENAI_MENU_MODEL", "gpt-4o")
    headers = {
        "Authorization": f"Bearer {os.environ['OPENAI_API_KEY'].strip()}",
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "model": model,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user)},
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            res.raise_for_status()
            data = res.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(content)
            return MenuEnrichResponse(
                description=str(parsed.get("description") or body.description or body.name),
                prepGuide=str(parsed.get("prepGuide") or ""),
                pairingNotes=str(parsed.get("pairingNotes") or ""),
                ingredients=str(parsed.get("ingredients") or ""),
                source="gpt-4o",
            )
    except Exception:
        # Never fail the floor — fall back to local professional copy.
        return _local_enrich(body)
