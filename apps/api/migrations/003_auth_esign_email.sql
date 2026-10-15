-- Auth users (tenant-scoped), proposal signing tokens, outbound email log

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Extend proposals for e-sign + outbound email tracking
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS access_token VARCHAR(64);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS signer_name VARCHAR(255);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS signer_email VARCHAR(255);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sent_to VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_proposals_access_token
  ON proposals(access_token)
  WHERE access_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_outbox (
    email_id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL REFERENCES tenants(tenant_id),
    proposal_id INT REFERENCES proposals(proposal_id) ON DELETE SET NULL,
    to_address VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    transport VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'queued',
    provider_message_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
