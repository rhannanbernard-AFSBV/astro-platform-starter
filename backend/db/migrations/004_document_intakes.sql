-- Asynchronous receipt and invoice intake for the active business profile.
--
-- The model copies printed fields. subtotal, tot_amount, tot_rate, and
-- grand_total on a completed row are written by Python after it prices the
-- lines and reads turnover tax from the tax tables. This file stores no rate.

CREATE TABLE allyanna.document_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES allyanna.users (id),
  status text NOT NULL,
  source_filename text NOT NULL,
  content_type text NOT NULL,
  byte_size integer NOT NULL,
  content bytea NOT NULL,
  vendor_name text,
  invoice_date date,
  currency_code text,
  tax_year integer,
  country_code text,
  tax_schedule_id uuid REFERENCES allyanna.tax_schedules (id),
  extracted_subtotal numeric(14, 2),
  extracted_tot_amount numeric(14, 2),
  extracted_grand_total numeric(14, 2),
  subtotal numeric(14, 2),
  tot_rate numeric(12, 8),
  tot_amount numeric(14, 2),
  grand_total numeric(14, 2),
  amounts_match boolean,
  discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT document_intakes_status CHECK (
    status IN ('queued', 'processing', 'completed', 'failed')
  ),
  CONSTRAINT document_intakes_filename CHECK (char_length(btrim(source_filename)) > 0),
  CONSTRAINT document_intakes_size CHECK (byte_size > 0 AND byte_size <= 8000000),
  CONSTRAINT document_intakes_content_type CHECK (
    content_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  CONSTRAINT document_intakes_open CHECK (
    status NOT IN ('queued', 'processing')
    OR (
      vendor_name IS NULL
      AND invoice_date IS NULL
      AND currency_code IS NULL
      AND tax_year IS NULL
      AND country_code IS NULL
      AND tax_schedule_id IS NULL
      AND extracted_subtotal IS NULL
      AND extracted_tot_amount IS NULL
      AND extracted_grand_total IS NULL
      AND subtotal IS NULL
      AND tot_rate IS NULL
      AND tot_amount IS NULL
      AND grand_total IS NULL
      AND amounts_match IS NULL
      AND error_message IS NULL
      AND completed_at IS NULL
      AND discrepancies = '[]'::jsonb
    )
  ),
  CONSTRAINT document_intakes_completed CHECK (
    status <> 'completed'
    OR (
      vendor_name IS NOT NULL
      AND char_length(btrim(vendor_name)) > 0
      AND invoice_date IS NOT NULL
      AND currency_code ~ '^[A-Z]{3}$'
      AND tax_year BETWEEN 2000 AND 2100
      AND country_code ~ '^[A-Z]{3}$'
      AND tax_schedule_id IS NOT NULL
      AND extracted_subtotal >= 0
      AND extracted_tot_amount >= 0
      AND extracted_grand_total >= 0
      AND subtotal >= 0
      AND tot_amount >= 0
      AND grand_total = subtotal + tot_amount
      AND tot_rate >= 0
      AND tot_rate <= 1
      AND amounts_match IS NOT NULL
      AND error_message IS NULL
      AND completed_at IS NOT NULL
      AND (
        (amounts_match AND discrepancies = '[]'::jsonb)
        OR (NOT amounts_match AND discrepancies <> '[]'::jsonb)
      )
    )
  ),
  CONSTRAINT document_intakes_failed CHECK (
    status <> 'failed'
    OR (
      error_message IS NOT NULL
      AND char_length(btrim(error_message)) > 0
      AND completed_at IS NOT NULL
      AND subtotal IS NULL
      AND tot_amount IS NULL
      AND grand_total IS NULL
    )
  )
);

CREATE INDEX document_intakes_tenant_created_idx
  ON allyanna.document_intakes (tenant_id, created_at DESC);

CREATE TABLE allyanna.document_intake_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES allyanna.tenants (id) ON DELETE CASCADE,
  document_intake_id uuid NOT NULL REFERENCES allyanna.document_intakes (id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  description text NOT NULL,
  quantity numeric(14, 4) NOT NULL,
  unit_price numeric(14, 2) NOT NULL,
  extracted_line_total numeric(14, 2),
  line_total numeric(14, 2) NOT NULL,
  CONSTRAINT document_intake_lines_order CHECK (line_number >= 1),
  CONSTRAINT document_intake_lines_unique UNIQUE (document_intake_id, line_number),
  CONSTRAINT document_intake_lines_description CHECK (char_length(btrim(description)) > 0),
  CONSTRAINT document_intake_lines_amounts CHECK (
    quantity > 0
    AND unit_price >= 0
    AND line_total >= 0
    AND (extracted_line_total IS NULL OR extracted_line_total >= 0)
  )
);

CREATE INDEX document_intake_lines_tenant_idx
  ON allyanna.document_intake_lines (tenant_id, document_intake_id);

CREATE OR REPLACE FUNCTION allyanna.enforce_document_line_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = allyanna, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM document_intakes
    WHERE id = NEW.document_intake_id
      AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'document line does not belong to this tenant document';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER document_intake_lines_tenant
  BEFORE INSERT OR UPDATE ON allyanna.document_intake_lines
  FOR EACH ROW
  EXECUTE FUNCTION allyanna.enforce_document_line_tenant();

REVOKE ALL ON FUNCTION allyanna.enforce_document_line_tenant() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION allyanna.enforce_document_line_tenant() TO allyanna_app;

ALTER TABLE allyanna.document_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.document_intakes FORCE ROW LEVEL SECURITY;
CREATE POLICY document_intakes_select_active_tenant ON allyanna.document_intakes
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY document_intakes_insert_active_tenant ON allyanna.document_intakes
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND actor_user_id = current_setting('allyanna.user_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY document_intakes_update_active_tenant ON allyanna.document_intakes
  FOR UPDATE
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  )
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND actor_user_id = current_setting('allyanna.user_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

ALTER TABLE allyanna.document_intake_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE allyanna.document_intake_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY document_intake_lines_select_active_tenant ON allyanna.document_intake_lines
  FOR SELECT
  USING (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );
CREATE POLICY document_intake_lines_insert_active_tenant ON allyanna.document_intake_lines
  FOR INSERT
  WITH CHECK (
    tenant_id = current_setting('allyanna.tenant_id', true)::uuid
    AND allyanna.user_can_access_tenant(tenant_id)
  );

GRANT SELECT, INSERT, UPDATE ON allyanna.document_intakes TO allyanna_app;
GRANT SELECT, INSERT ON allyanna.document_intake_lines TO allyanna_app;
