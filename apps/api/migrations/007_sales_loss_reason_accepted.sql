-- Sales loop hygiene: accepted vs won, loss reasons

ALTER TABLE bids ADD COLUMN IF NOT EXISTS loss_reason VARCHAR(120);
ALTER TABLE bids ADD COLUMN IF NOT EXISTS loss_notes TEXT;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS competitor_price NUMERIC(12,2);

-- Ensure outcome allows 'accepted' (VARCHAR — no enum constraint)
COMMENT ON COLUMN bids.outcome IS 'open|sent|accepted|won|lost|withdrawn';
