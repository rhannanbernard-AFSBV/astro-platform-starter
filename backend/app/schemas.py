"""Minimal Pydantic models shared by tenant deps (merge-friendly with compliance core)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class TenantContext(BaseModel):
    """Pillar 1: tenant identity carried on every request (RLS application state)."""

    tenant_id: UUID
    user_id: UUID
    role: str  # 'owner', 'employee', 'external_accountant' (Pillar 3)


class HealthResponse(BaseModel):
    status: str
    service: str
