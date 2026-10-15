-- An amendment is a later filing for the same period.
-- The earlier row stays in place. This file does not store a statutory percentage.

ALTER TABLE allyanna.tot_returns
  ADD COLUMN amends_return_id uuid REFERENCES allyanna.tot_returns (id) ON DELETE CASCADE,
  ADD CONSTRAINT tot_returns_amends_not_self CHECK (
    amends_return_id IS NULL OR amends_return_id <> id
  );

ALTER TABLE allyanna.tot_returns
  DROP CONSTRAINT tot_returns_period_unique;

CREATE UNIQUE INDEX tot_returns_period_unique
  ON allyanna.tot_returns (tenant_id, country_code, period_start, period_end)
  WHERE amends_return_id IS NULL;

CREATE UNIQUE INDEX tot_returns_amends_unique
  ON allyanna.tot_returns (amends_return_id)
  WHERE amends_return_id IS NOT NULL;

CREATE OR REPLACE FUNCTION allyanna.enforce_tot_return_amendment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
DECLARE
  prior_tenant uuid;
  prior_country text;
  prior_start date;
  prior_end date;
  prior_year integer;
BEGIN
  IF NEW.amends_return_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- A caller who cannot use this tenant is rejected by the insert policy.
  IF NOT allyanna.user_can_access_tenant(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id, country_code, period_start, period_end, tax_year
    INTO prior_tenant, prior_country, prior_start, prior_end, prior_year
  FROM tot_returns
  WHERE id = NEW.amends_return_id;

  IF prior_tenant IS NULL
    OR prior_tenant <> NEW.tenant_id
    OR prior_country <> NEW.country_code
    OR prior_start <> NEW.period_start
    OR prior_end <> NEW.period_end
    OR prior_year <> NEW.tax_year
  THEN
    RAISE EXCEPTION 'amendment does not belong to this tenant return';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tot_returns_amendment
  BEFORE INSERT ON allyanna.tot_returns
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_tot_return_amendment();

REVOKE ALL ON FUNCTION allyanna.enforce_tot_return_amendment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_tot_return_amendment() TO allyanna_app;
