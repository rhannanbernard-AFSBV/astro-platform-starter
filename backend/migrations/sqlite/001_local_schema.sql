-- ============================================================================
-- Allyanna embedded SQLite schema (Windows desktop / local mode)
-- Migration: 001_local_schema.sql
--
-- Ledger file: %LOCALAPPDATA%\Allyanna\allyanna_ledger.db
-- (Frankie's get_local_db_connection / initialize_local_sxm_tables)
--
-- Postgres RLS is not available in SQLite. Tenant isolation is enforced in
-- application SQL: every ledger query MUST filter / bind ``tenant_id``.
-- Money columns use TEXT so Python ``decimal.Decimal`` round-trips losslessly
-- (never REAL/float for money).
-- Tax rates remain keyed by tax_year + country_code ('SXM') — never formula literals.
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY NOT NULL,
    company_name TEXT NOT NULL,
    country_code TEXT NOT NULL DEFAULT 'SXM',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pillar 3: master/accountant accounts managing multiple business profiles
CREATE TABLE IF NOT EXISTS tenant_users (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'employee', 'external_accountant')),
    PRIMARY KEY (tenant_id, user_id)
);

-- Pillar 2: configurable tax tables (tax_year + country_code)
CREATE TABLE IF NOT EXISTS tax_rates (
    tax_year INTEGER NOT NULL,
    country_code TEXT NOT NULL DEFAULT 'SXM',
    tot_percentage TEXT NOT NULL,
    szv_wage_cap TEXT NOT NULL,
    szv_aov_employer_pct TEXT NOT NULL,
    szv_aov_employee_pct TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tax_year, country_code)
);

CREATE TABLE IF NOT EXISTS wage_tax_brackets (
    id TEXT PRIMARY KEY NOT NULL,
    tax_year INTEGER NOT NULL,
    country_code TEXT NOT NULL DEFAULT 'SXM',
    sort_order INTEGER NOT NULL DEFAULT 0,
    up_to TEXT,
    rate TEXT NOT NULL,
    FOREIGN KEY (tax_year, country_code)
        REFERENCES tax_rates (tax_year, country_code)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wage_tax_brackets_lookup
    ON wage_tax_brackets (tax_year, country_code, sort_order);

-- Frankie's local invoice ledger (tenant_id kept for SaaS compatibility)
CREATE TABLE IF NOT EXISTS local_invoices (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vendor_name TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    subtotal TEXT NOT NULL,
    tot_amount TEXT NOT NULL,
    grand_total TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_local_invoices_tenant
    ON local_invoices (tenant_id);

-- Frankie's local payroll ledger (tenant_id kept for SaaS compatibility)
CREATE TABLE IF NOT EXISTS local_payroll_records (
    id TEXT PRIMARY KEY NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_name TEXT NOT NULL,
    payroll_month TEXT NOT NULL,
    gross_salary TEXT NOT NULL,
    wage_tax_deduction TEXT NOT NULL,
    szv_employee_deduction TEXT NOT NULL,
    szv_employer_contribution TEXT NOT NULL,
    net_pay TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_local_payroll_tenant
    ON local_payroll_records (tenant_id);

-- Schema meta
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_migrations (version) VALUES ('001_local_schema');

-- Seed SXM 2026 tax tables (matches backend/data/sxm_tax_tables_2026.json)
INSERT OR IGNORE INTO tax_rates (
    tax_year, country_code, tot_percentage, szv_wage_cap,
    szv_aov_employer_pct, szv_aov_employee_pct
) VALUES (
    2026, 'SXM', '0.05', '5600.00', '0.0825', '0.0475'
);

INSERT OR IGNORE INTO wage_tax_brackets (id, tax_year, country_code, sort_order, up_to, rate)
VALUES
    ('bracket-sxm-2026-1', 2026, 'SXM', 1, '2000.00', '0.10'),
    ('bracket-sxm-2026-2', 2026, 'SXM', 2, NULL, '0.20');

-- Demo tenant for local desktop smoke (same IDs as JWT stub)
INSERT OR IGNORE INTO tenants (id, company_name, country_code)
VALUES ('11111111-1111-1111-1111-111111111111', 'Allyanna Demo Co', 'SXM');

INSERT OR IGNORE INTO users (id, email)
VALUES ('22222222-2222-2222-2222-222222222222', 'demo@allyanna.local');

INSERT OR IGNORE INTO tenant_users (tenant_id, user_id, role)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'owner'
);
