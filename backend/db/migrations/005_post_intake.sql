-- Post a completed document intake into the tenant invoice ledger.
--
-- document_intake_id ties one intake to one invoice. The posted subtotal,
-- turnover tax, and grand total are still the columns written by Python.
-- This file does not store a statutory rate.

ALTER TABLE allyanna.invoices
  ADD COLUMN document_intake_id uuid REFERENCES allyanna.document_intakes (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX invoices_document_intake_idx
  ON allyanna.invoices (document_intake_id)
  WHERE document_intake_id IS NOT NULL;

CREATE OR REPLACE FUNCTION allyanna.enforce_invoice_intake_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
BEGIN
  IF NEW.document_intake_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM document_intakes
    WHERE id = NEW.document_intake_id
      AND tenant_id = NEW.tenant_id
      AND status = 'completed'
  ) THEN
    RAISE EXCEPTION 'invoice intake does not belong to this tenant';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoices_intake_tenant
  BEFORE INSERT OR UPDATE ON allyanna.invoices
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_invoice_intake_tenant();

REVOKE ALL ON FUNCTION allyanna.enforce_invoice_intake_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_invoice_intake_tenant() TO allyanna_app;
