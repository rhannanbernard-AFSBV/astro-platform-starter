-- Allyanna foundation: master-account tenancy, row-level security, and SXM tax tables.
--
-- Tenant-owned tables carry tenant_id (or, for tenants itself, the row id is the
-- tenant) and FORCE ROW LEVEL SECURITY. Tax schedules are jurisdiction reference
-- data keyed by country_code + tax_year. They intentionally have no tenant_id.
-- Statutory rates live only in those rows. Python reads them; it does not embed them.
--
-- allyanna_app is the trusted service role. Callers must set allyanna.user_id from
-- a resolved API key before setting allyanna.tenant_id. Policies still require that
-- the user belongs to the master account that owns the tenant, so a wrong tenant
-- GUC cannot cross firms.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS allyanna;
REVOKE ALL ON SCHEMA allyanna FROM PUBLIC;
GRANT USAGE ON SCHEMA allyanna TO allyanna_app;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO allyanna_app', current_database());
END
$$;

-- ---------------------------------------------------------------------------
-- Identity. Users belong to a master account (an accounting firm) and reach
-- business data only through membership plus an active tenant context.
-- ---------------------------------------------------------------------------

CREATE TABLE allyanna.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_lowercase CHECK (email = lower(email))
);

CREATE TABLE allyanna.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES allyanna.users (id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE allyanna.master_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_accounts_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE TABLE allyanna.master_account_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_account_id uuid NOT NULL REFERENCES allyanna.master_accounts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES allyanna.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT master_account_members_role CHECK (role IN ('owner', 'staff')),
  CONSTRAINT master_account_members_unique UNIQUE (master_account_id, user_id)
);

CREATE INDEX master_account_members_user_idx
  ON allyanna.master_account_members (user_id);

-- Business profiles under a master account. id is the tenant_id used everywhere else.
CREATE TABLE allyanna.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_account_id uuid NOT NULL REFERENCES allyanna.master_accounts (id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  trade_name text,
  country_code text NOT NULL DEFAULT 'SXM',
  crib_number text,
  status text NOT NULL DEFAULT 'active',
  -- Employer's SZV accident-insurance (OV) rate, when SZV has assigned a risk class.
  -- Null uses the statutory default stored on the SZV component row.
  ov_employer_rate numeric(12, 8),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_country_code CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT tenants_status CHECK (status IN ('active', 'inactive')),
  CONSTRAINT tenants_ov_rate_unit CHECK (
    ov_employer_rate IS NULL
    OR (ov_employer_rate >= 0 AND ov_employer_rate <= 1)
  )
);

CREATE INDEX tenants_master_idx ON allyanna.tenants (master_account_id);

-- Active business profile for a signed-in user. tenant_id is the switched context.
CREATE TABLE allyanna.user_active_contexts (
  user_id uuid PRIMARY KEY REFERENCES allyanna.users (id) ON DELETE CASCADE,
  master_account_id uuid NOT NULL REFERENCES allyanna.master_accounts (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  switched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE allyanna.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES allyanna.users (id),
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_tenant_created_idx
  ON allyanna.audit_logs (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Tax reference data. Keyed by country_code + tax_year, never by tenant.
-- ---------------------------------------------------------------------------

CREATE TABLE allyanna.tax_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  tax_year integer NOT NULL,
  schedule_code text NOT NULL,
  calculation_method text NOT NULL,
  amount_period text NOT NULL,
  currency_code text NOT NULL,
  lower_inclusive boolean NOT NULL DEFAULT false,
  upper_inclusive boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL,
  effective_to date,
  source_note text NOT NULL,
  CONSTRAINT tax_schedules_country_code CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT tax_schedules_year CHECK (tax_year BETWEEN 2000 AND 2100),
  CONSTRAINT tax_schedules_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT tax_schedules_method CHECK (
    calculation_method IN ('flat_rate', 'progressive_step', 'capped_split')
  ),
  CONSTRAINT tax_schedules_period CHECK (amount_period IN ('transaction', 'year', 'month')),
  CONSTRAINT tax_schedules_step_bounds CHECK (
    calculation_method <> 'progressive_step'
    OR lower_inclusive <> upper_inclusive
  ),
  CONSTRAINT tax_schedules_unique UNIQUE (country_code, tax_year, schedule_code)
);

CREATE INDEX tax_schedules_lookup_idx
  ON allyanna.tax_schedules (country_code, tax_year);

CREATE TABLE allyanna.tot_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_schedule_id uuid NOT NULL UNIQUE REFERENCES allyanna.tax_schedules (id) ON DELETE CASCADE,
  rate numeric(12, 8) NOT NULL,
  CONSTRAINT tot_rates_unit CHECK (rate >= 0 AND rate <= 1)
);

CREATE TABLE allyanna.wage_tax_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_schedule_id uuid NOT NULL REFERENCES allyanna.tax_schedules (id) ON DELETE CASCADE,
  bracket_order integer NOT NULL,
  income_from numeric(14, 2) NOT NULL,
  income_to numeric(14, 2),
  rate numeric(12, 8) NOT NULL,
  base_tax numeric(14, 2) NOT NULL,
  CONSTRAINT wage_tax_brackets_order CHECK (bracket_order >= 1),
  CONSTRAINT wage_tax_brackets_unique UNIQUE (tax_schedule_id, bracket_order),
  CONSTRAINT wage_tax_brackets_amounts CHECK (
    income_from >= 0
    AND base_tax >= 0
    AND (income_to IS NULL OR income_to > income_from)
  ),
  CONSTRAINT wage_tax_brackets_rate CHECK (rate >= 0 AND rate <= 1)
);

CREATE TABLE allyanna.szv_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_schedule_id uuid NOT NULL REFERENCES allyanna.tax_schedules (id) ON DELETE CASCADE,
  component_order integer NOT NULL,
  component_code text NOT NULL,
  group_code text NOT NULL,
  employee_rate numeric(12, 8) NOT NULL,
  employer_rate numeric(12, 8) NOT NULL,
  monthly_wage_ceiling numeric(14, 2) NOT NULL,
  annual_wage_ceiling numeric(14, 2),
  employer_rate_min numeric(12, 8),
  employer_rate_max numeric(12, 8),
  rate_is_variable boolean NOT NULL DEFAULT false,
  CONSTRAINT szv_components_order CHECK (component_order >= 1),
  CONSTRAINT szv_components_unique UNIQUE (tax_schedule_id, component_code),
  CONSTRAINT szv_components_rates CHECK (
    employee_rate >= 0 AND employee_rate <= 1
    AND employer_rate >= 0 AND employer_rate <= 1
  ),
  CONSTRAINT szv_components_ceiling CHECK (monthly_wage_ceiling >= 0),
  CONSTRAINT szv_components_variable_bounds CHECK (
    NOT rate_is_variable
    OR (
      employer_rate_min IS NOT NULL
      AND employer_rate_max IS NOT NULL
      AND employer_rate_min <= employer_rate_max
      AND employer_rate >= employer_rate_min
      AND employer_rate <= employer_rate_max
    )
  )
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION allyanna.enforce_context_master()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM tenants
    WHERE id = NEW.tenant_id
      AND master_account_id = NEW.master_account_id
  ) THEN
    RAISE EXCEPTION 'tenant does not belong to master account';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_active_contexts_master
  BEFORE INSERT OR UPDATE ON allyanna.user_active_contexts
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_context_master();

-- Straight membership lookup. SECURITY DEFINER so the policy check does not
-- recurse through tenant policies. Returns no row data.
CREATE OR REPLACE FUNCTION allyanna.user_can_access_tenant(target_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = allyanna, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenants AS business
    INNER JOIN master_account_members AS membership
      ON membership.master_account_id = business.master_account_id
    WHERE business.id = target_tenant
      AND membership.user_id = current_setting('allyanna.user_id', true)::uuid
  );
$$;

CREATE OR REPLACE FUNCTION allyanna.resolve_api_key(p_key_hash text)
RETURNS TABLE (user_id uuid, email text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = allyanna, pg_temp
AS $$
  SELECT users.id, users.email, users.display_name
  FROM users
  INNER JOIN api_keys ON api_keys.user_id = users.id
  WHERE api_keys.key_hash = p_key_hash
    AND api_keys.revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION allyanna.enforce_context_master() FROM PUBLIC;
REVOKE ALL ON FUNCTION allyanna.user_can_access_tenant(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION allyanna.resolve_api_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_context_master() TO allyanna_app;
GRANT EXECUTE ON FUNCTION allyanna.user_can_access_tenant(uuid) TO allyanna_app;
GRANT EXECUTE ON FUNCTION allyanna.resolve_api_key(text) TO allyanna_app;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

ALTER TABLE allyanna.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.users FORCE ROW LEVEL SECURITY;
ALTER TABLE allyanna.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.api_keys FORCE ROW LEVEL SECURITY;
-- No policies on users or api_keys. The service role cannot read them.
-- Sign-in uses resolve_api_key.

ALTER TABLE allyanna.master_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.master_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY master_accounts_member_select ON allyanna.master_accounts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM allyanna.master_account_members AS membership
      WHERE membership.master_account_id = master_accounts.id
        AND membership.user_id = current_setting('allyanna.user_id', true)::uuid
    )
  );

ALTER TABLE allyanna.master_account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.master_account_members FORCE ROW LEVEL SECURITY;
CREATE POLICY master_members_select_own ON allyanna.master_account_members
  FOR SELECT
  USING (user_id = current_setting('allyanna.user_id', true)::uuid);

ALTER TABLE allyanna.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_select_member ON allyanna.tenants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM allyanna.master_account_members AS membership
      WHERE membership.master_account_id = tenants.master_account_id
        AND membership.user_id = current_setting('allyanna.user_id', true)::uuid
    )
  );

ALTER TABLE allyanna.user_active_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.user_active_contexts FORCE ROW LEVEL SECURITY;
CREATE POLICY active_context_own ON allyanna.user_active_contexts
  FOR ALL
  USING (user_id = current_setting('allyanna.user_id', true)::uuid)
  WITH CHECK (user_id = current_setting('allyanna.user_id', true)::uuid);

ALTER TABLE allyanna.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_select_active_tenant ON allyanna.audit_logs
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY audit_logs_insert_active_tenant ON allyanna.audit_logs
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND actor_user_id = current_setting('allyanna.user_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- Grants. Tax tables are read-only. Tenant tables are limited to what the API does.
-- ---------------------------------------------------------------------------

GRANT SELECT ON allyanna.master_accounts TO allyanna_app;
GRANT SELECT ON allyanna.master_account_members TO allyanna_app;
GRANT SELECT ON allyanna.tenants TO allyanna_app;
GRANT SELECT, INSERT, UPDATE ON allyanna.user_active_contexts TO allyanna_app;
GRANT SELECT, INSERT ON allyanna.audit_logs TO allyanna_app;
GRANT SELECT ON allyanna.tax_schedules TO allyanna_app;
GRANT SELECT ON allyanna.tot_rates TO allyanna_app;
GRANT SELECT ON allyanna.wage_tax_brackets TO allyanna_app;
GRANT SELECT ON allyanna.szv_components TO allyanna_app;
