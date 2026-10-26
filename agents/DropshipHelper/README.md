# DropshipHelper (Northlane)

AWS AgentCore Strands agent that helps operate the Northlane dropshipping brand across:

- Bed, bath, kitchens, home decor
- Jewelry, women's fashion
- Pet accessories, video games

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
agentcore invoke "Draft a reply for a customer asking when Cloudrest sheets will arrive."
```

## Tools

| Tool | Purpose |
| --- | --- |
| `northlane_shipping_policy` | Canonical US shipping copy |
| `northlane_returns_policy` | Returns / refund summary |
| `supplier_sample_checklist` | Pre-ads sample QA steps |
| `niche_angle_suggestions` | Product / LP angles by department |

## Pairing with the storefront

The Next.js store lives in `../../storefront`. Use this agent for ops copy; keep prices and tax math in human-reviewed store config—not in the LLM.
