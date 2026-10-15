# Canonical tip

**Branch:** `cursor/allyanna-tot-summary-statement-cfe6`

This branch is the Allyanna SXM API tip. It includes multi-tenant tax foundation, invoices, OCR intake, turnover-tax filing through annual summaries and dues actions, OCR period readiness, and payroll runs kept out of TOT math.

## Freeze

- Do **not** open new stacked TOT micro-PRs on intermediate branches.
- New API work branches from this tip (or from `main` after this tip merges).
- Intermediate drafts `#31`–`#35` and `#38`–`#49` are closed as superseded by this tip.

## Tracks (keep separate)

| Track | Scope |
|-------|--------|
| Turnover tax / OCR | Invoices, worksheets, returns, payments, summaries, dues, period-ready |
| Payroll | Monthly runs, wage-monthly, SZV on payslips — never in TOT worksheets. **Go-live: deferred** (API-only; no desk) |
| Product UI | Thin client under `frontend/` against this API |
| Production ops | Tip-aligned compose under repo-root `docker-compose.prod.yml` + `deploy/GO_LIVE.md` (supersedes obsolete PR #8) |

## Compliance path (no auto-file from OCR)

1. `POST /api/v1/documents` — intake (GPT extracts; Python prices TOT from the table)
2. `GET /api/v1/documents/review` — ready vs blocked; post path when ready
3. `POST /api/v1/documents/{id}/invoice` — ledger
4. `GET /api/v1/tax/tot/period-ready` — unposted, unfiled, open returns, dues
5. Follow dues `actions` — file unfiled, year statement, pay open returns
