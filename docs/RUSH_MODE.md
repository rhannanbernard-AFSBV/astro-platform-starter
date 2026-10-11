# Rush mode

Peak-service tempo for any busy period (cruise tender, lunch crush, Friday dinner).

## What it does

| Surface | Effect |
|---------|--------|
| Kitchen / Bar boards | Bump escalation uses `rushBumpMinutes` (default **4**) instead of normal `bumpAfterMinutes` (default 8) |
| Guest `/order` | Faster wait ETA; **Rush service** banner; polls every **10s** while rush is on |
| Staff chrome | Premium toggle + confirm + sticky banner; auto-off countdown |
| Notifications | Kitchen + bar get a **rush_alert** when rush turns on/off |
| Audit | Every toggle writes `rush_mode` to the audit log |
| Shift close | Shows rush minutes + checks/sales paid during rush windows |

## Who can toggle

By default: manager, admin, server, bartender.  
Optional admin setting **Manager/admin only may toggle Rush**.

Kitchen sees the banner and alerts but cannot toggle.

## Auto-off

Default **90 minutes**, with a warning at **10 minutes** left. Set auto-off to `0` to disable. Shift close also turns rush off.

## Shared wait math

Constants live in `shared/rush-wait.json` — used by the SPA (`rushMode.ts`) and API (`rush_constants.py`).

## Settings keys

`rushMode`, `rushModeSince`, `rushBumpMinutes`, `rushAutoOffMinutes`, `rushWarnMinutes`, `rushManagerOnly`, `rushSessions`
