# Rush mode

Peak-service tempo for any busy period (cruise tender, lunch crush, Friday dinner).

## What it does

| Surface | Effect |
|---------|--------|
| Kitchen / Bar boards | Bump escalation uses `rushBumpMinutes` (default **4**) instead of normal `bumpAfterMinutes` (default 8) |
| Guest `/order` | Wait estimate uses a faster model; banner shows **Rush service** |
| Staff chrome | Premium **Rush on** toggle + sticky banner while active |

## Who can toggle

Manager, admin, server, bartender (header control). Kitchen can see the banner but not toggle. Admin settings also expose Rush + rush bump minutes.

## Sync

Stored on `settings.rushMode` / `rushModeSince` / `rushBumpMinutes` in POS state — syncs across devices in server mode.
