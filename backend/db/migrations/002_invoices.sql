-- Tenant-scoped invoice documents.
--
-- subtotal, tot_amount, and grand_total are written by the API after the
-- turnover-tax calculation reads tot_rates. tot_rate is a snapshot of that row.
-- This migration does not store a statutory percentage for the formula to use.

CREATE TABLE allyanna.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  vendor_name text NOT NULL,
  invoice_number text,
  invoice_date date NOT NULL,
  due_date date,
  currency_code text NOT NULL,
  tax_year integer NOT NULL,
  country_code text NOT NULL,
  tax_schedule_id uuid NOT NULL REFERENCES allyanna.tax_schedules (id),
  subtotal numeric(14, 2) NOT NULL,
  tot_rate numeric(12, 8) NOT NULL,
  tot_amount numeric(14, 2) NOT NULL,
  grand_total numeric(14, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_vendor CHECK (char_length(btrim(vendor_name)) > 0),
  CONSTRAINT invoices_currency CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT invoices_country CHECK (country_code ~ '^[A-Z]{3}$'),
  CONSTRAINT invoices_year CHECK (tax_year BETWEEN 2000 AND 2100),
  CONSTRAINT invoices_due CHECK (due_date IS NULL OR due_date >= invoice_date),
  CONSTRAINT invoices_amounts CHECK (
    subtotal >= 0 AND tot_amount >= 0 AND grand_total = subtotal + tot_amount
  ),
  CONSTRAINT invoices_rate CHECK (tot_rate >= 0 AND tot_rate <= 1)
);

CREATE INDEX invoices_tenant_date_idx
  ON allyanna.invoices (tenant_id, invoice_date DESC, created_at DESC);

CREATE UNIQUE INDEX invoices_tenant_number_idx
  ON allyanna.invoices (tenant_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE TABLE allyanna.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES allyanna.invoices (id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  description text NOT NULL,
  quantity numeric(14, 4) NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  line_total numeric(14, 2) NOT NULL,
  CONSTRAINT invoice_lines_order CHECK (line_number >= 1),
  CONSTRAINT invoice_lines_unique UNIQUE (invoice_id, line_number),
  CONSTRAINT invoice_lines_description CHECK (char_length(btrim(description)) > 0),
  CONSTRAINT invoice_lines_amounts CHECK (
    quantity > 0 AND unit_price >= 0 AND line_total >= 0
  )
);

CREATE INDEX invoice_lines_tenant_idx ON allyanna.invoice_lines (tenant_id, invoice_id);

CREATE OR REPLACE FUNCTION allyanna.enforce_invoice_line_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM invoices
    WHERE id = NEW.invoice_id
      AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'invoice line does not belong to this tenant invoice';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER invoice_lines_tenant
  BEFORE INSERT OR UPDATE ON allyanna.invoice_lines
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_invoice_line_tenant();

REVOKE ALL ON FUNCTION allyanna.enforce_invoice_line_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_invoice_line_tenant() TO allyanna_app;

ALTER TABLE allyanna.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY invoices_select_active_tenant ON allyanna.invoices
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY invoices_insert_active_tenant ON allyanna.invoices
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

ALTER TABLE allyanna.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_lines_select_active_tenant ON allyanna.invoice_lines
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY invoice_lines_insert_active_tenant ON allyanna.invoice_lines
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

GRANT SELECT, INSERT ON allyanna.invoices TO allyanna_app;
GRANT SELECT, INSERT ON allyanna.invoice_lines TO allyanna_app;
