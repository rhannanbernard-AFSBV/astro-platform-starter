# DropshipHelper (Deskora)

AWS AgentCore Strands agent that helps operate the Deskora dropshipping brand:

- Shipping and returns FAQ drafts
- Supplier sample checklists
- Niche / landing-page angles for apartment desk tools

## Prerequisites

- AgentCore CLI (`npm install -g @aws/agentcore` or install to a user prefix)
- `uv` on your PATH
- AWS credentials with Bedrock access for deploy / model calls

## Local dev

```bash
export PATH="$HOME/.local/bin:$PATH"
cd agents/DropshipHelper
agentcore dev
```

Then invoke (port is printed by the CLI; default HTTP is often `8080`):

```bash
agentcore invoke "Draft a reply for a customer asking when Cable Harbor will arrive."
```

## Tools

| Tool | Purpose |
| --- | --- |
| `deskora_shipping_policy` | Canonical US shipping copy |
| `deskora_returns_policy` | Returns / refund summary |
| `supplier_sample_checklist` | Pre-ads sample QA steps |
| `niche_angle_suggestions` | Product / LP angle prompts |

## Pairing with the storefront

The Next.js store lives in `../../storefront`. Use this agent for ops copy; keep prices and tax math in human-reviewed Python/store config—not in the LLM.