"""Rush wait model — mirrors shared/rush-wait.json (keep in sync via tests)."""

from __future__ import annotations

import json
from pathlib import Path

_JSON = Path(__file__).resolve().parents[3] / "shared" / "rush-wait.json"


def _load() -> dict:
    if _JSON.is_file():
        return json.loads(_JSON.read_text(encoding="utf-8"))
    return {
        "normalMinutesPerUnit": 3.5,
        "rushMinutesPerUnit": 2.2,
        "normalWaitFloor": 8,
        "rushWaitFloor": 5,
        "normalWaitCeiling": 45,
        "rushWaitCeiling": 28,
        "defaultRushBumpMinutes": 4,
        "defaultAutoOffMinutes": 90,
        "defaultWarnMinutes": 10,
    }


_CFG = _load()

NORMAL_MINUTES_PER_UNIT = float(_CFG["normalMinutesPerUnit"])
RUSH_MINUTES_PER_UNIT = float(_CFG["rushMinutesPerUnit"])
NORMAL_WAIT_FLOOR = int(_CFG["normalWaitFloor"])
RUSH_WAIT_FLOOR = int(_CFG["rushWaitFloor"])
NORMAL_WAIT_CEILING = int(_CFG["normalWaitCeiling"])
RUSH_WAIT_CEILING = int(_CFG["rushWaitCeiling"])


def estimate_wait_minutes(active_tickets: int, rush_mode: bool) -> tuple[int, str]:
    active = max(0, int(active_tickets))
    per_unit = RUSH_MINUTES_PER_UNIT if rush_mode else NORMAL_MINUTES_PER_UNIT
    floor = RUSH_WAIT_FLOOR if rush_mode else NORMAL_WAIT_FLOOR
    ceiling = RUSH_WAIT_CEILING if rush_mode else NORMAL_WAIT_CEILING
    minutes = floor if active == 0 else min(ceiling, max(floor, int(round(active * per_unit))))
    if rush_mode:
        label = f"Rush · about {minutes} min"
    else:
        label = f"About {minutes} min" if active else f"About {floor}–{floor + 4} min"
    return minutes, label
