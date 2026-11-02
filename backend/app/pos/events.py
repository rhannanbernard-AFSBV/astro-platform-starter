"""In-process SSE fan-out for POS floor tablets."""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any


class PosEventBus:
    def __init__(self) -> None:
        self._queues: list[asyncio.Queue[dict[str, Any]]] = []
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[dict[str, Any]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=32)
        async with self._lock:
            self._queues.append(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        async with self._lock:
            if queue in self._queues:
                self._queues.remove(queue)

    async def publish(self, event: dict[str, Any]) -> None:
        payload = {**event, "ts": int(time.time() * 1000)}
        async with self._lock:
            targets = list(self._queues)
        for queue in targets:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                try:
                    _ = queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(payload)
                except asyncio.QueueFull:
                    pass


bus = PosEventBus()


def format_sse(event: dict[str, Any], event_name: str = "pos") -> str:
    body = json.dumps(event, separators=(",", ":"))
    return f"event: {event_name}\ndata: {body}\n\n"
