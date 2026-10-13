-- Photo QA, crew GPS, client portal insurance fields, site geofence

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS insurance_coi_url VARCHAR(500);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS insurance_notes TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS insurance_liability_limit VARCHAR(100);

ALTER TABLE bid_checklists ADD COLUMN IF NOT EXISTS qa_verified_at TIMESTAMP;
ALTER TABLE bid_checklists ADD COLUMN IF NOT EXISTS qa_photo_url VARCHAR(500);
ALTER TABLE bid_checklists ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE bid_checklists ADD COLUMN IF NOT EXISTS completed_lat NUMERIC(10,7);
ALTER TABLE bid_checklists ADD COLUMN IF NOT EXISTS completed_lng NUMERIC(10,7);

CREATE TABLE IF NOT EXISTS checklist_qa_photos (
    qa_photo_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id),
    bid_id INT NOT NULL REFERENCES bids(bid_id) ON DELETE CASCADE,
    checklist_id INT NOT NULL REFERENCES bid_checklists(checklist_id) ON DELETE CASCADE,
    photo_url VARCHAR(500) NOT NULL,
    ai_audit_prompt TEXT,
    notes TEXT,
    uploaded_by INT REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_qa_photos_bid ON checklist_qa_photos(bid_id);
CREATE INDEX IF NOT EXISTS idx_qa_photos_tenant ON checklist_qa_photos(tenant_id);

CREATE TABLE IF NOT EXISTS crew_gps_events (
    event_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id),
    bid_id INT NOT NULL REFERENCES bids(bid_id) ON DELETE CASCADE,
    checklist_id INT REFERENCES bid_checklists(checklist_id) ON DELETE SET NULL,
    user_id INT REFERENCES users(user_id),
    event_type VARCHAR(50) NOT NULL,
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    accuracy_m NUMERIC(10,2),
    within_geofence BOOLEAN,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gps_events_bid ON crew_gps_events(bid_id);
CREATE INDEX IF NOT EXISTS idx_gps_events_tenant ON crew_gps_events(tenant_id);

CREATE TABLE IF NOT EXISTS bid_site_geofences (
    geofence_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id),
    bid_id INT NOT NULL UNIQUE REFERENCES bids(bid_id) ON DELETE CASCADE,
    center_lat NUMERIC(10,7) NOT NULL,
    center_lng NUMERIC(10,7) NOT NULL,
    radius_m NUMERIC(10,2) NOT NULL DEFAULT 150.00,
    label VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Soft-editable ISSA rates remain global; tenant may override density selection via tenant_currency_settings
ALTER TABLE tenant_currency_settings ADD COLUMN IF NOT EXISTS labor_burden_override NUMERIC(6,4);
ALTER TABLE jurisdiction_tax_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
