"""Short-lived cache of tax bundles, keyed by country, year, and schedule."""

import time
from typing import Any

from allyanna.errors import TaxTableNotFound
from allyanna.tax.models import TaxBundle
from allyanna.tax.repository import TaxRepository

Connection = Any


class TaxTableCache:
    def __init__(self, ttl_seconds: int, repository: TaxRepository) -> None:
        self._ttl = max(ttl_seconds, 0)
        self._repository = repository
        self._entries: dict[tuple[str, int, str], tuple[float, TaxBundle]] = {}

    def clear(self) -> None:
        self._entries.clear()

    async def get_bundle(
        self,
        conn: Connection,
        *,
        country_code: str,
        tax_year: int,
        schedule_code: str,
    ) -> TaxBundle:
        key = (country_code, tax_year, schedule_code)
        cached = self._entries.get(key)
        now = time.monotonic()
        if cached is not None and cached[0] > now:
            return cached[1]
        bundle = await self._repository.load_bundle(
            conn,
            country_code=country_code,
            tax_year=tax_year,
            schedule_code=schedule_code,
        )
        if bundle is None:
            raise TaxTableNotFound(
                f"No {schedule_code} table for {country_code} {tax_year}"
            )
        self._entries[key] = (now + self._ttl, bundle)
        return bundle
