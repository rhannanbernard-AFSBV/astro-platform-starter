import asyncio

from app.pos.ai import MenuEnrichRequest, enrich_menu_item, openai_configured


def test_local_enrich_wine_pairs_jamaican_meals(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert openai_configured() is False

    result = asyncio.run(
        enrich_menu_item(
            MenuEnrichRequest(
                name="Cloudy Bay Sauvignon Blanc",
                category="Wine",
                description="",
                origin="Marlborough, New Zealand",
                vintageYear=2023,
            )
        )
    )
    assert result.source == "local"
    assert result.prepGuide
    assert result.ingredients
    lowered = result.pairingNotes.lower()
    assert any(word in lowered for word in ("jerk", "ackee", "festival", "oxtail", "curry"))
