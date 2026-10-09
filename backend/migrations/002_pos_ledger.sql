-- ============================================================================
-- Savory POS ledger tables (Allyanna-compatible, tenant-scoped + RLS)
-- Migration: 002_pos_ledger.sql
-- Apply after 001_multi_tenant_rls.sql when using Postgres in production.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pos_staff (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('kitchen', 'bartender', 'server', 'admin', 'manager')),
    initials VARCHAR(8) NOT NULL,
    pin_hash TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_sessions (
    token_hash TEXT PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES pos_staff(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_snapshots (
    tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    updated_at BIGINT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pos_sales_ledger (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sale_json JSONB NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL,
    total_cents INTEGER NOT NULL,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    voided_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pos_audit_ledger (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entry_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pos_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sales_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_audit_ledger ENABLE ROW LEVEL SECURITY;

ALTER TABLE pos_staff FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_sales_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE pos_audit_ledger FORCE ROW LEVEL SECURITY;

CREATE POLICY pos_staff_tenant ON pos_staff
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY pos_sessions_tenant ON pos_sessions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY pos_snapshots_tenant ON pos_snapshots
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY pos_sales_tenant ON pos_sales_ledger
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

CREATE POLICY pos_audit_tenant ON pos_audit_ledger
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
