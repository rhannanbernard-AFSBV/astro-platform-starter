-- One correcting invoice may be posted against the latest filing for a period.
-- An ordinary invoice in that period is still rejected.
-- This file does not store a statutory percentage.

ALTER TABLE allyanna.invoices
  ADD COLUMN corrects_return_id uuid REFERENCES allyanna.tot_returns (id) ON DELETE CASCADE;

CREATE UNIQUE INDEX invoices_one_correction_per_return
  ON allyanna.invoices (corrects_return_id)
  WHERE corrects_return_id IS NOT NULL;

CREATE OR REPLACE FUNCTION allyanna.enforce_invoice_outside_filed_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
DECLARE
  prior_tenant uuid;
  prior_country text;
  prior_year integer;
  prior_start date;
  prior_end date;
  prior_amended boolean;
BEGIN
  -- A caller who cannot use this tenant is rejected by the insert policy.
  IF NOT allyanna.user_can_access_tenant(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.corrects_return_id IS NOT NULL THEN
    SELECT
      tenant_id,
      country_code,
      tax_year,
      period_start,
      period_end,
      EXISTS (
        SELECT 1
        FROM tot_returns AS later
        WHERE later.amends_return_id = tot_returns.id
          AND later.tenant_id = tot_returns.tenant_id
      )
    INTO prior_tenant, prior_country, prior_year, prior_start, prior_end, prior_amended
    FROM tot_returns
    WHERE id = NEW.corrects_return_id;

    IF prior_tenant IS NULL
      OR prior_tenant <> NEW.tenant_id
      OR prior_country <> NEW.country_code
      OR prior_year <> NEW.tax_year
      OR prior_amended
      OR NEW.invoice_date < prior_start
      OR NEW.invoice_date > prior_end
    THEN
      RAISE EXCEPTION 'correcting invoice does not belong to this tenant return';
    END IF;

    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tot_returns
    WHERE tenant_id = NEW.tenant_id
      AND country_code = NEW.country_code
      AND period_start <= NEW.invoice_date
      AND period_end >= NEW.invoice_date
  ) THEN
    RAISE EXCEPTION 'invoice date falls in a filed period';
  END IF;

  RETURN NEW;
END;
$$;
