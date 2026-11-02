"""Ensure Python rush wait model matches shared/rush-wait.json."""

from __future__ import annotations

import json
from pathlib import Path

from app.pos.rush_constants import (
    NORMAL_MINUTES_PER_UNIT,
    RUSH_MINUTES_PER_UNIT,
    estimate_wait_minutes,
)

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = json.loads((ROOT / "shared" / "rush-wait.json").read_text(encoding="utf-8"))


def test_constants_match_shared_fixture():
    assert NORMAL_MINUTES_PER_UNIT == FIXTURE["normalMinutesPerUnit"]
    assert RUSH_MINUTES_PER_UNIT == FIXTURE["rushMinutesPerUnit"]


def test_rush_estimate_faster_than_normal():
    calm_m, _ = estimate_wait_minutes(6, False)
    rush_m, rush_label = estimate_wait_minutes(6, True)
    assert rush_m < calm_m
    assert "Rush" in rush_label
