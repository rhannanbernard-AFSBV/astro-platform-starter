-- An amendment stores the year totals after later payments.
-- The earlier summary stays in place. This file does not store a statutory percentage.

ALTER TABLE allyanna.tot_annual_summaries
  ADD COLUMN amends_summary_id uuid REFERENCES allyanna.tot_annual_summaries (id) ON DELETE CASCADE,
  ADD CONSTRAINT tot_annual_summaries_amends_not_self CHECK (
    amends_summary_id IS NULL OR amends_summary_id <> id
  );

DROP INDEX allyanna.tot_annual_summaries_year_unique;

CREATE UNIQUE INDEX tot_annual_summaries_year_unique
  ON allyanna.tot_annual_summaries (tenant_id, country_code, tax_year)
  WHERE amends_summary_id IS NULL;

CREATE UNIQUE INDEX tot_annual_summaries_amends_unique
  ON allyanna.tot_annual_summaries (amends_summary_id)
  WHERE amends_summary_id IS NOT NULL;

CREATE OR REPLACE FUNCTION allyanna.enforce_tot_annual_summary()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
DECLARE
  prior_tenant uuid;
  prior_country text;
  prior_year integer;
  prior_currency text;
BEGIN
  -- A caller who cannot use this tenant is rejected by the insert policy.
  IF NOT allyanna.user_can_access_tenant(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.amends_summary_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, country_code, tax_year, currency_code
    INTO prior_tenant, prior_country, prior_year, prior_currency
  FROM tot_annual_summaries
  WHERE id = NEW.amends_summary_id;

  IF prior_tenant IS NULL
    OR prior_tenant <> NEW.tenant_id
    OR prior_country <> NEW.country_code
    OR prior_year <> NEW.tax_year
    OR prior_currency <> NEW.currency_code
  THEN
    RAISE EXCEPTION 'amendment does not belong to this tenant summary';
  END IF;

  RETURN NEW;
END;
$$;
