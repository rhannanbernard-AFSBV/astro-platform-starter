"""Card payment rails via Stripe PaymentIntents (optional)."""

from __future__ import annotations

import os
from typing import Any


def stripe_enabled() -> bool:
    return bool(os.getenv("STRIPE_SECRET_KEY"))


def create_card_intent(
    *,
    amount_cents: int,
    currency: str = "usd",
    metadata: dict[str, str] | None = None,
) -> dict[str, Any]:
    """
    Create a Stripe PaymentIntent for card collection.

    Returns client_secret for Stripe.js / Terminal. Raises RuntimeError if Stripe
    is not configured.
    """
    secret = os.getenv("STRIPE_SECRET_KEY")
    if not secret:
        raise RuntimeError(
            "Stripe is not configured. Set STRIPE_SECRET_KEY for live card rails, "
            "or use cash / manual card capture."
        )
    import stripe

    stripe.api_key = secret
    intent = stripe.PaymentIntent.create(
        amount=max(0, int(amount_cents)),
        currency=currency.lower(),
        automatic_payment_methods={"enabled": True},
        metadata=metadata or {},
    )
    return {
        "paymentIntentId": intent["id"],
        "clientSecret": intent["client_secret"],
        "status": intent["status"],
        "amountCents": intent["amount"],
        "currency": intent["currency"],
    }


def retrieve_intent(payment_intent_id: str) -> dict[str, Any]:
    secret = os.getenv("STRIPE_SECRET_KEY")
    if not secret:
        raise RuntimeError("Stripe is not configured")
    import stripe

    stripe.api_key = secret
    intent = stripe.PaymentIntent.retrieve(payment_intent_id)
    return {
        "paymentIntentId": intent["id"],
        "status": intent["status"],
        "amountCents": intent["amount"],
        "currency": intent["currency"],
    }
