-- OmniClean AI Scanner — core schema (multi-tenant)

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    jurisdiction_code VARCHAR(10) NOT NULL DEFAULT 'SXM',
    logo_url VARCHAR(500),
    company_email VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jurisdiction_tax_settings (
    jurisdiction_code VARCHAR(10) PRIMARY KEY,
    country_name VARCHAR(100) NOT NULL,
    tot_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0500,
    labor_burden_multiplier NUMERIC(6,4) NOT NULL DEFAULT 1.1200,
    consumables_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0250,
    default_margin_rate NUMERIC(6,4) NOT NULL DEFAULT 0.3000,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS issa_production_rates (
    rate_id SERIAL PRIMARY KEY,
    density_code VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(100) NOT NULL,
    sq_ft_per_hour NUMERIC(10,2) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS global_exchange_rates (
    currency_code VARCHAR(3) PRIMARY KEY,
    currency_symbol VARCHAR(5) NOT NULL,
    exchange_rate_to_usd NUMERIC(10,4) NOT NULL,
    is_fixed_peg BOOLEAN DEFAULT FALSE,
    last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_currency_settings (
    tenant_setting_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL UNIQUE REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    primary_currency_code VARCHAR(3) DEFAULT 'USD' REFERENCES global_exchange_rates(currency_code),
    enable_dual_quoting BOOLEAN DEFAULT FALSE,
    secondary_currency_code VARCHAR(3) DEFAULT 'XCG' REFERENCES global_exchange_rates(currency_code),
    custom_markup_percentage NUMERIC(5,2) DEFAULT 0.00,
    base_hourly_wage NUMERIC(10,2) NOT NULL DEFAULT 18.00,
    target_margin_percentage NUMERIC(5,2) NOT NULL DEFAULT 30.00,
    shifts_per_year INT NOT NULL DEFAULT 260,
    facility_density_code VARCHAR(50) NOT NULL DEFAULT 'office_low'
);

CREATE TABLE IF NOT EXISTS bids (
    bid_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id),
    client_name VARCHAR(255) NOT NULL,
    property_address VARCHAR(500),
    frequency VARCHAR(100) DEFAULT '5x / week',
    total_sq_ft NUMERIC(10,2) NOT NULL,
    monthly_price NUMERIC(10,2) NOT NULL,
    shift_hours NUMERIC(5,2) NOT NULL,
    raw_ai_payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bid_checklists (
    checklist_id SERIAL PRIMARY KEY,
    bid_id INT NOT NULL REFERENCES bids(bid_id) ON DELETE CASCADE,
    room_zone VARCHAR(100) NOT NULL,
    tasks TEXT[] NOT NULL,
    is_high_risk BOOLEAN DEFAULT FALSE,
    ai_audit_prompt TEXT
);

CREATE TABLE IF NOT EXISTS proposals (
    proposal_id SERIAL PRIMARY KEY,
    bid_id INT NOT NULL REFERENCES bids(bid_id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'Draft',
    proposal_text TEXT NOT NULL,
    email_html TEXT,
    signature_url VARCHAR(500),
    signed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bids_tenant ON bids(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bid_checklists_bid ON bid_checklists(bid_id);
CREATE INDEX IF NOT EXISTS idx_proposals_bid ON proposals(bid_id);
