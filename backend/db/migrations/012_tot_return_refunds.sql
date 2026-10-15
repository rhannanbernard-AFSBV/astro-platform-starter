-- A refund reduces the amount paid on the latest filing.
-- The original payment row stays. This file does not store a statutory percentage.

CREATE TABLE allyanna.tot_return_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  tot_return_id uuid NOT NULL REFERENCES allyanna.tot_returns (id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL,
  refunded_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tot_return_refunds_amount CHECK (amount > 0)
);

CREATE INDEX tot_return_refunds_return_idx
  ON allyanna.tot_return_refunds (tenant_id, tot_return_id, refunded_on, recorded_at);

CREATE OR REPLACE FUNCTION allyanna.enforce_tot_refund_return()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
DECLARE
  prior_tenant uuid;
  prior_amended boolean;
  prior_id uuid;
  cursor_id uuid;
  net_paid numeric(14, 2);
  guard integer;
BEGIN
  -- A caller who cannot use this tenant is rejected by the insert policy.
  IF NOT allyanna.user_can_access_tenant(NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  SELECT
    tenant_id,
    EXISTS (
      SELECT 1
      FROM tot_returns AS later
      WHERE later.amends_return_id = tot_returns.id
        AND later.tenant_id = tot_returns.tenant_id
    )
  INTO prior_tenant, prior_amended
  FROM tot_returns
  WHERE id = NEW.tot_return_id;

  IF prior_tenant IS NULL OR prior_tenant <> NEW.tenant_id OR prior_amended THEN
    RAISE EXCEPTION 'refund does not belong to this tenant return';
  END IF;

  net_paid := 0;
  cursor_id := NEW.tot_return_id;
  guard := 0;
  WHILE cursor_id IS NOT NULL AND guard < 20 LOOP
    guard := guard + 1;
    net_paid := net_paid + COALESCE((
      SELECT SUM(amount)
      FROM tot_return_payments
      WHERE tot_return_id = cursor_id
        AND tenant_id = NEW.tenant_id
    ), 0::numeric);
    net_paid := net_paid - COALESCE((
      SELECT SUM(amount)
      FROM tot_return_refunds
      WHERE tot_return_id = cursor_id
        AND tenant_id = NEW.tenant_id
        AND id IS DISTINCT FROM NEW.id
    ), 0::numeric);
    SELECT amends_return_id INTO prior_id
    FROM tot_returns
    WHERE id = cursor_id
      AND tenant_id = NEW.tenant_id;
    cursor_id := prior_id;
  END LOOP;

  IF NEW.amount > net_paid THEN
    RAISE EXCEPTION 'refund exceeds the amount paid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tot_return_refunds_return
  BEFORE INSERT OR UPDATE ON allyanna.tot_return_refunds
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_tot_refund_return();

REVOKE ALL ON FUNCTION allyanna.enforce_tot_refund_return() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_tot_refund_return() TO allyanna_app;

ALTER TABLE allyanna.tot_return_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.tot_return_refunds FORCE ROW LEVEL SECURITY;
CREATE POLICY tot_return_refunds_select_active_tenant ON allyanna.tot_return_refunds
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY tot_return_refunds_insert_active_tenant ON allyanna.tot_return_refunds
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

GRANT SELECT, INSERT ON allyanna.tot_return_refunds TO allyanna_app;

-- A later payment on the same filing can use the room a refund opened.
CREATE OR REPLACE FUNCTION allyanna.enforce_tot_payment_return()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
DECLARE
  filed_tax numeric(14, 2);
  already_paid numeric(14, 2);
  already_refunded numeric(14, 2);
BEGIN
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

  SELECT COALESCE(SUM(amount), 0::numeric) INTO already_refunded
  FROM tot_return_refunds
  WHERE tot_return_id = NEW.tot_return_id
    AND tenant_id = NEW.tenant_id;

  IF already_paid - already_refunded + NEW.amount > filed_tax THEN
    RAISE EXCEPTION 'payment exceeds the filed turnover tax';
  END IF;

  RETURN NEW;
END;
$$;
