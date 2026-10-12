-- A payment settles the filed turnover tax on tot_returns.tot_amount.
-- This file does not store a statutory percentage.

CREATE TABLE allyanna.tot_return_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  tot_return_id uuid NOT NULL REFERENCES allyanna.tot_returns (id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL,
  paid_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tot_return_payments_amount CHECK (amount > 0)
);

CREATE INDEX tot_return_payments_return_idx
  ON allyanna.tot_return_payments (tenant_id, tot_return_id, paid_on, recorded_at);

CREATE OR REPLACE FUNCTION allyanna.enforce_tot_payment_return()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
DECLARE
  filed_tax numeric(14, 2);
  already_paid numeric(14, 2);
BEGIN
  -- A caller who cannot use this tenant is rejected by the insert policy.
  IF NOT allyanna.user_can_access_tenant(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  SELECT tot_amount INTO filed_tax
  FROM tot_returns
  WHERE id = NEW.tot_return_id
    AND tenant_id = NEW.tenant_id;

  IF filed_tax IS NULL THEN
    RAISE EXCEPTION 'payment does not belong to this tenant return';
  END IF;

  SELECT COALESCE(SUM(amount), 0::numeric) INTO already_paid
  FROM tot_return_payments
  WHERE tot_return_id = NEW.tot_return_id
    AND tenant_id = NEW.tenant_id
    AND id IS DISTINCT FROM NEW.id;

  IF already_paid + NEW.amount > filed_tax THEN
    RAISE EXCEPTION 'payment exceeds the filed turnover tax';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tot_return_payments_return
  BEFORE INSERT OR UPDATE ON allyanna.tot_return_payments
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_tot_payment_return();

REVOKE ALL ON FUNCTION allyanna.enforce_tot_payment_return() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_tot_payment_return() TO allyanna_app;

ALTER TABLE allyanna.tot_return_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.tot_return_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY tot_return_payments_select_active_tenant ON allyanna.tot_return_payments
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY tot_return_payments_insert_active_tenant ON allyanna.tot_return_payments
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

GRANT SELECT, INSERT ON allyanna.tot_return_payments TO allyanna_app;
