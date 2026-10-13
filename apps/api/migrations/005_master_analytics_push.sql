-- Master/sub-tenant, bid outcomes, push devices, offline sync log

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS master_tenant_id INT REFERENCES tenants(tenant_id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS insurance_coi_filename VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_tenants_master ON tenants(master_tenant_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS master_tenant_access (
    access_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, tenant_id)
);

ALTER TABLE bids ADD COLUMN IF NOT EXISTS outcome VARCHAR(50) DEFAULT 'open';
ALTER TABLE bids ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMP;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS won_monthly_revenue NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_bids_outcome ON bids(tenant_id, outcome);

CREATE TABLE IF NOT EXISTS push_devices (
    device_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL DEFAULT 'expo',
    push_token VARCHAR(500) NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, push_token)
);

CREATE TABLE IF NOT EXISTS push_outbox (
    push_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id),
    bid_id INT REFERENCES bids(bid_id) ON DELETE SET NULL,
    event_type VARCHAR(80) NOT NULL,
    payload JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'stubbed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS offline_sync_batches (
    batch_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id),
    user_id INT REFERENCES users(user_id),
    bid_id INT NOT NULL REFERENCES bids(bid_id) ON DELETE CASCADE,
    client_batch_id VARCHAR(100),
    events_count INT NOT NULL DEFAULT 0,
    applied_count INT NOT NULL DEFAULT 0,
    payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed master firm + sub-tenant for demo (idempotent)
INSERT INTO tenants (tenant_id, name, jurisdiction_code, company_email, is_master)
VALUES (100, 'OmniClean Master Firm', 'SXM', 'firm@omniclean.demo', TRUE)
ON CONFLICT (tenant_id) DO NOTHING;

UPDATE tenants SET master_tenant_id = 100
WHERE tenant_id = 1 AND (master_tenant_id IS NULL);

INSERT INTO tenants (tenant_id, name, jurisdiction_code, company_email, master_tenant_id, is_master)
VALUES (2, 'Simpson Bay Villas Cleaning', 'SXM', 'simpson@omniclean.demo', 100, FALSE)
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_currency_settings (
  tenant_id, primary_currency_code, enable_dual_quoting, secondary_currency_code,
  custom_markup_percentage, base_hourly_wage, target_margin_percentage,
  shifts_per_year, facility_density_code
) VALUES
  (100, 'USD', TRUE, 'XCG', 0.00, 20.00, 30.00, 260, 'office_low'),
  (2, 'USD', TRUE, 'XCG', 0.00, 17.00, 28.00, 260, 'retail')
ON CONFLICT (tenant_id) DO NOTHING;
