"""Async Postgres pool for the service role."""

import asyncpg


async def create_pool(database_url: str) -> asyncpg.Pool:
    return await asyncpg.create_pool(
        database_url,
        min_size=1,
        max_size=5,
        server_settings={
            "application_name": "allyanna-api",
            "search_path": "allyanna",
            "statement_timeout": "10000",
        },
    )
