-- An annual summary freezes the year-to-date tax, amount paid, and balance.
-- The period filings stay in place. This file does not store a statutory percentage.

CREATE TABLE allyanna.tot_annual_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  country_code text NOT NULL,
  tax_year integer NOT NULL,
  currency_code text NOT NULL,
  filing_count integer NOT NULL,
  tax_due numeric(14, 2) NOT NULL,
  amount_paid numeric(14, 2) NOT NULL,
  balance_due numeric(14, 2) NOT NULL,
  filed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tot_annual_summaries_country CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT tot_annual_summaries_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT tot_annual_summaries_year CHECK (tax_year BETWEEN 2000 AND 2100),
  CONSTRAINT tot_annual_summaries_count CHECK (filing_count >= 1),
  CONSTRAINT tot_annual_summaries_amounts CHECK (
    tax_due >= 0
    AND amount_paid >= 0
    AND balance_due >= 0
    AND balance_due = tax_due - amount_paid
  )
);

CREATE UNIQUE INDEX tot_annual_summaries_year_unique
  ON allyanna.tot_annual_summaries (tenant_id, country_code, tax_year);

CREATE INDEX tot_annual_summaries_tenant_idx
  ON allyanna.tot_annual_summaries (tenant_id, tax_year DESC);

CREATE OR REPLACE FUNCTION allyanna.enforce_tot_annual_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
BEGIN
  -- A caller who cannot use this tenant is rejected by the insert policy.
  IF NOT allyanna.user_can_access_tenant(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tot_annual_summaries_tenant
  BEFORE INSERT OR UPDATE ON allyanna.tot_annual_summaries
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_tot_annual_summary();

REVOKE ALL ON FUNCTION allyanna.enforce_tot_annual_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_tot_annual_summary() TO allyanna_app;

ALTER TABLE allyanna.tot_annual_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.tot_annual_summaries FORCE ROW LEVEL SECURITY;
CREATE POLICY tot_annual_summaries_select_active_tenant ON allyanna.tot_annual_summaries
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY tot_annual_summaries_insert_active_tenant ON allyanna.tot_annual_summaries
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

GRANT SELECT, INSERT ON allyanna.tot_annual_summaries TO allyanna_app;
