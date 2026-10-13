-- Human calibrate gate + proposal sign OTP / one-time hardening

ALTER TABLE bids ADD COLUMN IF NOT EXISTS pricing_committed BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS calibrated_at TIMESTAMP;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS calibrated_by INT REFERENCES users(user_id) ON DELETE SET NULL;

-- New scans defer commit until calibrate; existing rows stay committed
COMMENT ON COLUMN bids.pricing_committed IS 'False until estimator confirms sq ft / fixtures via calibrate API';

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sign_otp_hash VARCHAR(128);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sign_otp_expires_at TIMESTAMP;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sign_otp_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sign_otp_sent_to VARCHAR(255);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sign_one_time_token_hash VARCHAR(128);
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sign_one_time_token_expires_at TIMESTAMP;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS sign_one_time_token_used_at TIMESTAMP;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS access_token_revoked_at TIMESTAMP;

COMMENT ON COLUMN proposals.sign_otp_hash IS 'SHA-256 of email OTP required before e-sign';
COMMENT ON COLUMN proposals.sign_one_time_token_hash IS 'SHA-256 of single-use sign token issued after OTP verify';
COMMENT ON COLUMN proposals.access_token_revoked_at IS 'Set after successful sign so portal link cannot be re-used to re-sign';
