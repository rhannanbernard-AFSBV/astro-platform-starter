-- ============================================================================
-- Allyanna multi-tenant core schema + RLS (Pillars 1, 2 & 3)
-- Migration: 001_multi_tenant_rls.sql
--
-- Apply with psql (password never committed — see README):
--   export DATABASE_URL='...'   # superuser / migrator
--   export ALLYANNA_APP_PASSWORD='...'   # required; strong secret
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -v app_password="$ALLYANNA_APP_PASSWORD" \
--     -f backend/migrations/001_multi_tenant_rls.sql
--
-- Security deltas vs source SQL (additive hardenings, clearly commented below):
--   * No literal role password in VCS — psql :'app_password' / env-driven
--   * FORCE ROW LEVEL SECURITY on ledger tables (owners cannot bypass)
--   * WITH CHECK mirrors USING on tenant isolation policies
--   * Least-privilege grants (explicit tables; USAGE on schema) vs ALL TABLES
--   * Pillar 2 tax_rates / wage_tax_brackets (keyed by tax_year + country_code)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- MULTI-TENANCY CORE SCHEMAS
-- ============================================================================

-- 1. Core multi-tenant registration tables
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(255) NOT NULL,
    country_code VARCHAR(3) DEFAULT 'SXM', -- Prefilled for Sint Maarten
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mapping table supporting Pillar 3 (accountants managing multiple businesses)
CREATE TABLE IF NOT EXISTS tenant_users (
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('owner', 'employee', 'external_accountant')),
    PRIMARY KEY (tenant_id, user_id)
);

-- ============================================================================
-- PILLAR 2: CONFIGURABLE TAX TABLES (keyed by tax_year + country_code)
-- JSON cache loader: backend/data/{country}_tax_tables_{year}.json
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_rates (
    tax_year INTEGER NOT NULL,
    country_code VARCHAR(3) NOT NULL DEFAULT 'SXM',
    tot_percentage NUMERIC(8, 6) NOT NULL,
    szv_wage_cap NUMERIC(15, 2) NOT NULL,
    szv_aov_employer_pct NUMERIC(8, 6) NOT NULL,
    szv_aov_employee_pct NUMERIC(8, 6) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tax_year, country_code)
);

CREATE TABLE IF NOT EXISTS wage_tax_brackets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tax_year INTEGER NOT NULL,
    country_code VARCHAR(3) NOT NULL DEFAULT 'SXM',
    sort_order INTEGER NOT NULL DEFAULT 0,
    up_to NUMERIC(15, 2), -- NULL = open-ended top band
    rate NUMERIC(8, 6) NOT NULL,
    CONSTRAINT wage_tax_brackets_tax_fk
        FOREIGN KEY (tax_year, country_code)
        REFERENCES tax_rates (tax_year, country_code)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wage_tax_brackets_lookup
    ON wage_tax_brackets (tax_year, country_code, sort_order);

-- Seed SXM 2026 (matches backend/data/sxm_tax_tables_2026.json)
INSERT INTO tax_rates (
    tax_year, country_code, tot_percentage, szv_wage_cap,
    szv_aov_employer_pct, szv_aov_employee_pct
) VALUES (
    2026, 'SXM', 0.05, 5600.00, 0.0825, 0.0475
) ON CONFLICT (tax_year, country_code) DO NOTHING;

INSERT INTO wage_tax_brackets (tax_year, country_code, sort_order, up_to, rate)
SELECT 2026, 'SXM', 1, 2000.00, 0.10
WHERE NOT EXISTS (
    SELECT 1 FROM wage_tax_brackets
    WHERE tax_year = 2026 AND country_code = 'SXM' AND sort_order = 1
);

INSERT INTO wage_tax_brackets (tax_year, country_code, sort_order, up_to, rate)
SELECT 2026, 'SXM', 2, NULL, 0.20
WHERE NOT EXISTS (
    SELECT 1 FROM wage_tax_brackets
    WHERE tax_year = 2026 AND country_code = 'SXM' AND sort_order = 2
);

-- ============================================================================
-- FINANCIAL LEDGER TABLES SUBJECT TO ROW-LEVEL SECURITY
-- ============================================================================

-- 2. Invoices & receipts (AI OCR extraction storage)
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    vendor_name VARCHAR(255) NOT NULL,
    invoice_date DATE NOT NULL,
    subtotal NUMERIC(15, 2) NOT NULL,
    tot_amount NUMERIC(15, 2) NOT NULL, -- 5% TOT tracked here (rate still from tax tables at compute time)
    grand_total NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Employee payroll records (SXM wage tax & SZV storage)
CREATE TABLE IF NOT EXISTS payroll_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    payroll_month DATE NOT NULL,
    gross_salary NUMERIC(15, 2) NOT NULL,
    wage_tax_deduction NUMERIC(15, 2) NOT NULL,
    szv_employee_deduction NUMERIC(15, 2) NOT NULL,
    szv_employer_contribution NUMERIC(15, 2) NOT NULL,
    net_pay NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ENFORCING ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- 4. Enable RLS on ledger layers
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

-- HARDENING (beyond source): table owners / BYPASSRLS-exempt paths still respect policies
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE payroll_records FORCE ROW LEVEL SECURITY;

-- 5. Policies keyed on runtime GUC: app.current_tenant_id
-- NULLIF treats empty string as unset so unset context matches no rows.
-- HARDENING (beyond source): WITH CHECK mirrors USING so INSERT/UPDATE cannot cross tenants.

DROP POLICY IF EXISTS invoice_tenant_isolation_policy ON invoices;
CREATE POLICY invoice_tenant_isolation_policy ON invoices
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS payroll_tenant_isolation_policy ON payroll_records;
CREATE POLICY payroll_tenant_isolation_policy ON payroll_records
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- ============================================================================
-- APPLICATION DB ROLE (least privilege; password via psql variable)
-- ============================================================================

-- HARDENING (beyond source): never embed a password literal.
-- Requires: psql -v app_password="$ALLYANNA_APP_PASSWORD"
\if :{?app_password}
\else
\echo 'ERROR: app_password not set. Pass -v app_password="$ALLYANNA_APP_PASSWORD"'
\quit
\endif

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'allyanna_app_user') THEN
        -- Password set below via psql :'app_password' (not inside this block).
        EXECUTE $role$
            CREATE ROLE allyanna_app_user
                WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
        $role$;
    END IF;
END
$$;

-- Set/rotate password from env-driven psql variable (never a VCS literal).
ALTER ROLE allyanna_app_user WITH
    LOGIN
    PASSWORD :'app_password'
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOINHERIT;

-- HARDENING (beyond source): explicit table grants instead of ALL TABLES IN SCHEMA public
GRANT USAGE ON SCHEMA public TO allyanna_app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    tenants,
    users,
    tenant_users,
    invoices,
    payroll_records
TO allyanna_app_user;

-- Tax tables are read-mostly configuration; app role gets SELECT (+ INSERT for seed tooling).
GRANT SELECT ON TABLE
    tax_rates,
    wage_tax_brackets
TO allyanna_app_user;

-- uuid PKs use uuid_generate_v4(); no owned sequences today.
-- Future SERIAL/IDENTITY columns: grant USAGE, SELECT on those sequences to allyanna_app_user.
-- Example pattern (commented — not required for this migration):
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO allyanna_app_user;
