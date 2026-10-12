"""Tenancy rows visible to the signed-in user."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID


@dataclass(frozen=True)
class User:
    id: UUID
    email: str
    display_name: str


@dataclass(frozen=True)
class Membership:
    master_account_id: UUID
    name: str
    slug: str
    role: str


@dataclass(frozen=True)
class Tenant:
    id: UUID
    master_account_id: UUID
    legal_name: str
    trade_name: str | None
    country_code: str
    crib_number: str | None
    status: str
    ov_employer_rate: Decimal | None


@dataclass(frozen=True)
class ActiveContext:
    user_id: UUID
    master_account_id: UUID
    tenant_id: UUID
    switched_at: datetime


@dataclass(frozen=True)
class ContextSnapshot:
    memberships: tuple[Membership, ...]
    tenants: tuple[Tenant, ...]
    active: ActiveContext | None
