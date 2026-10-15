-- Payroll runs for the active business profile, plus the monthly wage-tax
-- lookup tables those runs read.
--
-- Wage-class rows and the withholding rules are jurisdiction reference data.
-- They have no tenant_id. Statutory amounts stay in the seed, not in this file.
-- payroll_runs, payroll_lines, and payroll_szv_lines are tenant-owned.

ALTER TABLE allyanna.tax_schedules DROP CONSTRAINT tax_schedules_method;
ALTER TABLE allyanna.tax_schedules ADD CONSTRAINT tax_schedules_method CHECK (
  calculation_method IN (
    'flat_rate',
    'progressive_step',
    'capped_split',
    'wage_class_lookup'
  )
);

ALTER TABLE allyanna.szv_components
  ADD COLUMN reduces_wage_tax_base boolean NOT NULL DEFAULT false;

CREATE TABLE allyanna.wage_tax_withholding_rules (
  tax_schedule_id uuid PRIMARY KEY REFERENCES allyanna.tax_schedules (id) ON DELETE CASCADE,
  withholding_free_maximum numeric(14, 2) NOT NULL,
  excess_rate numeric(12, 8) NOT NULL,
  monthly_acquisition_cost numeric(14, 2) NOT NULL,
  CONSTRAINT wage_tax_withholding_free CHECK (withholding_free_maximum >= 0),
  CONSTRAINT wage_tax_withholding_excess CHECK (excess_rate >= 0 AND excess_rate <= 1),
  CONSTRAINT wage_tax_withholding_acquisition CHECK (monthly_acquisition_cost >= 0)
);

CREATE TABLE allyanna.wage_tax_lookup_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_schedule_id uuid NOT NULL REFERENCES allyanna.tax_schedules (id) ON DELETE CASCADE,
  wage_amount numeric(14, 2) NOT NULL,
  tax_amount numeric(14, 2) NOT NULL,
  CONSTRAINT wage_tax_lookup_unique UNIQUE (tax_schedule_id, wage_amount),
  CONSTRAINT wage_tax_lookup_amounts CHECK (wage_amount >= 0 AND tax_amount >= 0)
);

CREATE TABLE allyanna.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  country_code text NOT NULL,
  currency_code text NOT NULL,
  wage_tax_schedule_id uuid NOT NULL REFERENCES allyanna.tax_schedules (id),
  szv_schedule_id uuid NOT NULL REFERENCES allyanna.tax_schedules (id),
  employee_count integer NOT NULL,
  gross_wages numeric(14, 2) NOT NULL,
  employee_szv_total numeric(14, 2) NOT NULL,
  employer_szv_total numeric(14, 2) NOT NULL,
  wage_tax_total numeric(14, 2) NOT NULL,
  net_wages numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_runs_period_unique UNIQUE (tenant_id, period_year, period_month),
  CONSTRAINT payroll_runs_year CHECK (period_year BETWEEN 2000 AND 2100),
  CONSTRAINT payroll_runs_month CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT payroll_runs_country CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payroll_runs_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT payroll_runs_counts CHECK (employee_count >= 1),
  CONSTRAINT payroll_runs_amounts CHECK (
    gross_wages >= 0
    AND employee_szv_total >= 0
    AND employer_szv_total >= 0
    AND wage_tax_total >= 0
    AND net_wages >= 0
    AND net_wages = gross_wages - employee_szv_total - wage_tax_total
  )
);

CREATE INDEX payroll_runs_tenant_period_idx
  ON allyanna.payroll_runs (tenant_id, period_year DESC, period_month DESC);

CREATE TABLE allyanna.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  payroll_run_id uuid NOT NULL REFERENCES allyanna.payroll_runs (id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  employee_name text NOT NULL,
  employee_code text,
  gross_wage numeric(14, 2) NOT NULL,
  acquisition_cost numeric(14, 2) NOT NULL,
  aov_aww_employee_deduction numeric(14, 2) NOT NULL,
  wage_tax_base numeric(14, 2) NOT NULL,
  wage_tax_withheld numeric(14, 2) NOT NULL,
  withholding_method text NOT NULL,
  table_wage_amount numeric(14, 2),
  table_tax_amount numeric(14, 2),
  excess_wage numeric(14, 2) NOT NULL,
  excess_rate numeric(12, 8) NOT NULL,
  employee_szv_total numeric(14, 2) NOT NULL,
  employer_szv_total numeric(14, 2) NOT NULL,
  net_wage numeric(14, 2) NOT NULL,
  CONSTRAINT payroll_lines_order CHECK (line_number >= 1),
  CONSTRAINT payroll_lines_unique UNIQUE (payroll_run_id, line_number),
  CONSTRAINT payroll_lines_name CHECK (char_length(btrim(employee_name)) > 0),
  CONSTRAINT payroll_lines_code CHECK (
    employee_code IS NULL OR char_length(btrim(employee_code)) > 0
  ),
  CONSTRAINT payroll_lines_method CHECK (
    withholding_method IN ('free_threshold', 'below_table', 'table', 'table_plus_excess')
  ),
  CONSTRAINT payroll_lines_rate CHECK (excess_rate >= 0 AND excess_rate <= 1),
  CONSTRAINT payroll_lines_amounts CHECK (
    gross_wage >= 0
    AND acquisition_cost >= 0
    AND acquisition_cost <= gross_wage
    AND aov_aww_employee_deduction >= 0
    AND wage_tax_base = gross_wage - acquisition_cost - aov_aww_employee_deduction
    AND wage_tax_base >= 0
    AND wage_tax_withheld >= 0
    AND excess_wage >= 0
    AND employee_szv_total >= 0
    AND employer_szv_total >= 0
    AND net_wage >= 0
    AND net_wage = gross_wage - employee_szv_total - wage_tax_withheld
  ),
  CONSTRAINT payroll_lines_withholding CHECK (
    (
      withholding_method IN ('free_threshold', 'below_table')
      AND table_wage_amount IS NULL
      AND table_tax_amount IS NULL
      AND excess_wage = 0
      AND wage_tax_withheld = 0
    )
    OR (
      withholding_method = 'table'
      AND table_wage_amount IS NOT NULL
      AND table_tax_amount IS NOT NULL
      AND excess_wage = 0
      AND wage_tax_withheld = table_tax_amount
    )
    OR (
      withholding_method = 'table_plus_excess'
      AND table_wage_amount IS NOT NULL
      AND table_tax_amount IS NOT NULL
      AND excess_wage > 0
      AND wage_tax_withheld >= table_tax_amount
    )
  )
);

CREATE INDEX payroll_lines_tenant_idx
  ON allyanna.payroll_lines (tenant_id, payroll_run_id);

CREATE UNIQUE INDEX payroll_lines_code_idx
  ON allyanna.payroll_lines (payroll_run_id, employee_code)
  WHERE employee_code IS NOT NULL;

CREATE TABLE allyanna.payroll_szv_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  payroll_line_id uuid NOT NULL REFERENCES allyanna.payroll_lines (id) ON DELETE CASCADE,
  component_code text NOT NULL,
  group_code text NOT NULL,
  capped_wage numeric(14, 2) NOT NULL,
  employee_rate numeric(12, 8) NOT NULL,
  employer_rate numeric(12, 8) NOT NULL,
  employee_amount numeric(14, 2) NOT NULL,
  employer_amount numeric(14, 2) NOT NULL,
  CONSTRAINT payroll_szv_unique UNIQUE (payroll_line_id, component_code),
  CONSTRAINT payroll_szv_amounts CHECK (
    capped_wage >= 0
    AND employee_rate >= 0 AND employee_rate <= 1
    AND employer_rate >= 0 AND employer_rate <= 1
    AND employee_amount >= 0
    AND employer_amount >= 0
  )
);

CREATE INDEX payroll_szv_tenant_idx
  ON allyanna.payroll_szv_lines (tenant_id, payroll_line_id);

CREATE OR REPLACE FUNCTION allyanna.enforce_payroll_line_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM payroll_runs
    WHERE id = NEW.payroll_run_id
      AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'payroll line does not belong to this tenant run';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_lines_tenant
  BEFORE INSERT OR UPDATE ON allyanna.payroll_lines
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_payroll_line_tenant();

CREATE OR REPLACE FUNCTION allyanna.enforce_payroll_szv_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM payroll_lines
    WHERE id = NEW.payroll_line_id
      AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'payroll premium line does not belong to this tenant line';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payroll_szv_lines_tenant
  BEFORE INSERT OR UPDATE ON allyanna.payroll_szv_lines
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_payroll_szv_tenant();

REVOKE ALL ON FUNCTION allyanna.enforce_payroll_line_tenant() FROM PUBLIC;
REVOKE ALL ON FUNCTION allyanna.enforce_payroll_szv_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_payroll_line_tenant() TO allyanna_app;
GRANT EXECUTE ON FUNCTION allyanna.enforce_payroll_szv_tenant() TO allyanna_app;

ALTER TABLE allyanna.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.payroll_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_runs_select_active_tenant ON allyanna.payroll_runs
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY payroll_runs_insert_active_tenant ON allyanna.payroll_runs
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

ALTER TABLE allyanna.payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.payroll_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_lines_select_active_tenant ON allyanna.payroll_lines
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY payroll_lines_insert_active_tenant ON allyanna.payroll_lines
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

ALTER TABLE allyanna.payroll_szv_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.payroll_szv_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY payroll_szv_select_active_tenant ON allyanna.payroll_szv_lines
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY payroll_szv_insert_active_tenant ON allyanna.payroll_szv_lines
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

GRANT SELECT ON allyanna.wage_tax_withholding_rules TO allyanna_app;
GRANT SELECT ON allyanna.wage_tax_lookup_rows TO allyanna_app;
GRANT SELECT, INSERT ON allyanna.payroll_runs TO allyanna_app;
GRANT SELECT, INSERT ON allyanna.payroll_lines TO allyanna_app;
GRANT SELECT, INSERT ON allyanna.payroll_szv_lines TO allyanna_app;
