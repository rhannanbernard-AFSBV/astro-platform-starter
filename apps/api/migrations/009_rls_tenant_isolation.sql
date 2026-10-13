-- OmniClean #7: Postgres RLS on tenant-scoped tables + invite codes for register hardening.
-- Policies use current_setting('app.tenant_id') / app.rls_bypass (set per request from JWT).
-- FORCE ROW LEVEL SECURITY so the table owner (typical Railway role) cannot skip policies.

-- —— Backfill tenant_id on child tables ——
ALTER TABLE bid_checklists ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(tenant_id);
UPDATE bid_checklists c
SET tenant_id = b.tenant_id
FROM bids b
WHERE c.bid_id = b.bid_id AND c.tenant_id IS NULL;
-- Orphan rows (should not exist): drop or attach to tenant 1 for demo safety
DELETE FROM bid_checklists WHERE tenant_id IS NULL;
ALTER TABLE bid_checklists ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bid_checklists_tenant ON bid_checklists(tenant_id);

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS tenant_id INT REFERENCES tenants(tenant_id);
UPDATE proposals p
SET tenant_id = b.tenant_id
FROM bids b
WHERE p.bid_id = b.bid_id AND p.tenant_id IS NULL;
DELETE FROM proposals WHERE tenant_id IS NULL;
ALTER TABLE proposals ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_tenant ON proposals(tenant_id);

-- —— Invite codes (register must use company_name or invite — no open join to tenant 1) ——
CREATE TABLE IF NOT EXISTS tenant_invites (
    invite_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    expires_at TIMESTAMP,
    max_uses INT,
    use_count INT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant ON tenant_invites(tenant_id);

-- —— Helper: true when session may see/write this tenant_id ——
-- Used inline in policies (no SECURITY DEFINER functions required).

-- —— Enable + force RLS ——
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'tenant_currency_settings',
    'bids',
    'bid_checklists',
    'proposals',
    'checklist_qa_photos',
    'crew_gps_events',
    'bid_site_geofences',
    'email_outbox',
    'push_devices',
    'push_outbox',
    'offline_sync_batches',
    'audit_logs',
    'master_tenant_access',
    'tenant_invites'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Drop old policies if re-applied (idempotent)
DROP POLICY IF EXISTS omniclean_users_tenant ON users;
DROP POLICY IF EXISTS omniclean_tenant_currency_settings_tenant ON tenant_currency_settings;
DROP POLICY IF EXISTS omniclean_bids_tenant ON bids;
DROP POLICY IF EXISTS omniclean_bid_checklists_tenant ON bid_checklists;
DROP POLICY IF EXISTS omniclean_proposals_tenant ON proposals;
DROP POLICY IF EXISTS omniclean_qa_photos_tenant ON checklist_qa_photos;
DROP POLICY IF EXISTS omniclean_gps_events_tenant ON crew_gps_events;
DROP POLICY IF EXISTS omniclean_geofences_tenant ON bid_site_geofences;
DROP POLICY IF EXISTS omniclean_email_outbox_tenant ON email_outbox;
DROP POLICY IF EXISTS omniclean_push_devices_tenant ON push_devices;
DROP POLICY IF EXISTS omniclean_push_outbox_tenant ON push_outbox;
DROP POLICY IF EXISTS omniclean_offline_sync_tenant ON offline_sync_batches;
DROP POLICY IF EXISTS omniclean_audit_logs_tenant ON audit_logs;
DROP POLICY IF EXISTS omniclean_master_access_tenant ON master_tenant_access;
DROP POLICY IF EXISTS omniclean_tenant_invites_tenant ON tenant_invites;

-- Tenant match OR bypass GUC
-- current_setting(..., true) returns NULL when unset (no error)

-- users: tenant match, self row (master switch keeps home tenant_id on the user row), or bypass
CREATE POLICY omniclean_users_tenant ON users
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
    OR user_id = NULLIF(current_setting('app.user_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
    OR user_id = NULLIF(current_setting('app.user_id', true), '')::int
  );

CREATE POLICY omniclean_tenant_currency_settings_tenant ON tenant_currency_settings
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_bids_tenant ON bids
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_bid_checklists_tenant ON bid_checklists
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_proposals_tenant ON proposals
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_qa_photos_tenant ON checklist_qa_photos
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_gps_events_tenant ON crew_gps_events
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_geofences_tenant ON bid_site_geofences
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_email_outbox_tenant ON email_outbox
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_push_devices_tenant ON push_devices
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_push_outbox_tenant ON push_outbox
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

CREATE POLICY omniclean_offline_sync_tenant ON offline_sync_batches
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

-- audit_logs: tenant_id may be NULL (system); allow NULL rows when bypass or matching tenant
CREATE POLICY omniclean_audit_logs_tenant ON audit_logs
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id IS NULL
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

-- master_tenant_access: allow by tenant OR by current user_id (list accessible tenants)
CREATE POLICY omniclean_master_access_tenant ON master_tenant_access
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
    OR user_id = NULLIF(current_setting('app.user_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
    OR user_id = NULLIF(current_setting('app.user_id', true), '')::int
  );

CREATE POLICY omniclean_tenant_invites_tenant ON tenant_invites
  FOR ALL
  USING (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  )
  WITH CHECK (
    current_setting('app.rls_bypass', true) = 'on'
    OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
  );

COMMENT ON TABLE tenant_invites IS 'Register join codes — open self-join to DEFAULT_TENANT_ID is disabled';
