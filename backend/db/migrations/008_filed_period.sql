-- A new invoice cannot use a date inside a period that is already filed.
-- This file does not store a statutory percentage.

CREATE OR REPLACE FUNCTION allyanna.enforce_invoice_outside_filed_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
BEGIN
  -- A caller who cannot use this tenant is rejected by the insert policy.
  IF NOT allyanna.user_can_access_tenant(NEW.tenant_id) THEN
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

CREATE TRIGGER invoices_outside_filed_period
  BEFORE INSERT ON allyanna.invoices
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_invoice_outside_filed_period();

REVOKE ALL ON FUNCTION allyanna.enforce_invoice_outside_filed_period() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_invoice_outside_filed_period() TO allyanna_app;
