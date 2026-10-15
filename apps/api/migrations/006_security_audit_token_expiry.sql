-- Proposal token expiry + audit log for sensitive actions

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMP;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS access_token_created_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id SERIAL PRIMARY KEY,
    tenant_id INT,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(80),
    resource_id VARCHAR(80),
    ip_address VARCHAR(64),
    user_agent TEXT,
    meta JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- Backfill expiry for existing tokens (30 days from now if null)
UPDATE proposals
SET access_token_created_at = COALESCE(access_token_created_at, created_at, CURRENT_TIMESTAMP),
    access_token_expires_at = COALESCE(
      access_token_expires_at,
      CURRENT_TIMESTAMP + INTERVAL '30 days'
    )
WHERE access_token IS NOT NULL;
