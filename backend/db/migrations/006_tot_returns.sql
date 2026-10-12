-- A filed turnover-tax return freezes one period for the active business.
--
-- subtotal and tot_amount are the summed posted invoice amounts.
-- rate is the turnover-tax table rate at filing time.
-- This file does not store a statutory percentage for the formula to use.

CREATE TABLE allyanna.tot_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  country_code text NOT NULL,
  tax_year integer NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency_code text NOT NULL,
  tax_schedule_id uuid NOT NULL REFERENCES allyanna.tax_schedules (id),
  rate numeric(12, 8) NOT NULL,
  invoice_count integer NOT NULL,
  subtotal numeric(14, 2) NOT NULL,
  tot_amount numeric(14, 2) NOT NULL,
  grand_total numeric(14, 2) NOT NULL,
  filed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tot_returns_country CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT tot_returns_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT tot_returns_year CHECK (tax_year BETWEEN 2000 AND 2100),
  CONSTRAINT tot_returns_period CHECK (
    period_end >= period_start
    AND period_start >= make_date(tax_year, 1, 1)
    AND period_end < make_date(tax_year + 1, 1, 1)
  ),
  CONSTRAINT tot_returns_rate CHECK (rate >= 0 AND rate <= 1),
  CONSTRAINT tot_returns_count CHECK (invoice_count >= 0),
  CONSTRAINT tot_returns_amounts CHECK (
    subtotal >= 0
    AND tot_amount >= 0
    AND grand_total = subtotal + tot_amount
  ),
  CONSTRAINT tot_returns_period_unique UNIQUE (tenant_id, country_code, period_start, period_end)
);

CREATE INDEX tot_returns_tenant_period_idx
  ON allyanna.tot_returns (tenant_id, period_start DESC, period_end DESC);

ALTER TABLE allyanna.tot_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.tot_returns FORCE ROW LEVEL SECURITY;
CREATE POLICY tot_returns_select_active_tenant ON allyanna.tot_returns
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY tot_returns_insert_active_tenant ON allyanna.tot_returns
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

GRANT SELECT, INSERT ON allyanna.tot_returns TO allyanna_app;
