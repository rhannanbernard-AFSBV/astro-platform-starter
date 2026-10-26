from functools import lru_cache

from strands import Agent, tool
from strands.agent.conversation_manager.null_conversation_manager import NullConversationManager
from bedrock_agentcore.runtime import BedrockAgentCoreApp
from model.load import load_model
from parse import parse_payload
from memory.session import get_memory_session_manager

DEFAULT_SYSTEM_PROMPT = """You are Deskora Helper, an operations assistant for the Deskora dropshipping brand.

Deskora sells compact desk tools for apartment remote workers in the United States (USD).
Shipping promise on the storefront: 8–14 business days. Catalog items start as placeholders until supplier samples are approved.

Your jobs:
- Help refine niche, product angles, and landing-page copy in plain language
- Draft customer FAQ answers that match Deskora shipping and returns policies
- Outline supplier sample checklists (quality, packaging, real transit time)
- Warn against fake reviews, inflated shipping claims, and LLM-invented financial math

Be concise. Prefer checklists and short paragraphs. If you lack a fact, say what the operator should verify with a supplier or sample order.
"""

tools = []


@tool
def deskora_shipping_policy() -> str:
    """Return Deskora's current shipping policy text for customer replies."""
    return (
        "Ships from the fulfillment partner in 8–14 business days to US addresses. "
        "Tracking is emailed when the package leaves the warehouse. "
        "Orders placed before 2:00 p.m. Eastern forward the same business day; "
        "weekend orders forward Monday. If tracking stalls for seven days after the "
        "ship email, replace or refund."
    )


@tool
def deskora_returns_policy() -> str:
    """Return Deskora's returns policy summary for customer replies."""
    return (
        "Within 30 days of delivery: damaged, wrong, or not-as-described items get a "
        "replacement or refund after photos. Change-of-mind unused returns may require "
        "the customer to cover return shipping—confirm before anything is sent back. "
        "Approved refunds post in 5–10 business days."
    )


@tool
def supplier_sample_checklist(product_name: str) -> str:
    """Build a sample-order checklist before scaling ads for a product."""
    name = product_name.strip() or "the product"
    return (
        f"Sample checklist for {name}:\n"
        "1. Order one unit to your own US address; note order date and carrier.\n"
        "2. Measure real transit days vs the 8–14 business day promise.\n"
        "3. Photograph packaging, inserts, and the unboxed item.\n"
        "4. Compare materials and finish to storefront claims.\n"
        "5. Test a damaged-item scenario with the supplier support channel.\n"
        "6. Confirm unit cost + shipping + payment fees still leave margin after ads.\n"
        "7. Keep a backup supplier contact before scaling paid traffic."
    )


@tool
def niche_angle_suggestions(audience: str) -> str:
    """Suggest Deskora-aligned product angles for a described audience."""
    focus = audience.strip() or "apartment remote workers"
    return (
        f"Angles for {focus}:\n"
        "- Lead with one daily friction (cables, screen height, glare, clutter).\n"
        "- Keep the kit under ten SKUs; every SKU must earn desk space.\n"
        "- Show shipping time in the first viewport near the price.\n"
        "- Prefer product-in-use photography over abstract lifestyle collage.\n"
        "- Test one hero SKU (Cable Harbor) before expanding the grid."
    )


tools.extend(
    [
        deskora_shipping_policy,
        deskora_returns_policy,
        supplier_sample_checklist,
        niche_angle_suggestions,
    ]
)


def _make_conversation_manager():
    return NullConversationManager()


@lru_cache(maxsize=128)
def _get_agent(session_id: str, actor_id: str) -> Agent:
    return Agent(
        model=load_model(),
        session_manager=get_memory_session_manager(session_id, actor_id),
        conversation_manager=_make_conversation_manager(),
        system_prompt=DEFAULT_SYSTEM_PROMPT,
        tools=tools,
    )


def create_app():
    app = BedrockAgentCoreApp()
    log = app.logger

    @app.entrypoint
    async def invoke(payload, context):
        log.info("Invoking Deskora Helper.....")

        session_id = getattr(context, "session_id", None) or "default-session"
        prompt, actor_id = parse_payload(payload)

        log.info(f"Invoking with session_id={session_id} and actor_id={actor_id}")
        agent = _get_agent(session_id, actor_id)

        async for event in agent.stream_async(prompt):
            if not isinstance(event, dict) or "event" not in event:
                continue
            cbs = event["event"].get("contentBlockStart")
            if cbs is not None and not cbs.get("start"):
                continue
            yield event

    return app


app = create_app()
if __name__ == "__main__":
    app.run()
