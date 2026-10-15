-- Local / staging dual-firm demo only. Do NOT apply in production.
-- Plaintext Bearer keys: allyanna-dev-key, allyanna-other-key (SHA-256 hashed below).

DELETE FROM allyanna.master_accounts
WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111112'
);

DELETE FROM allyanna.users
WHERE id IN (
  '33333333-3333-4333-8333-333333333333',
  '33333333-3333-4333-8333-333333333334'
);

INSERT INTO allyanna.master_accounts (id, name, slug) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Harbour Ledger & Co.', 'harbour-ledger'),
  ('11111111-1111-4111-8111-111111111112', 'Other Office', 'other-office');

INSERT INTO allyanna.tenants (
  id, master_account_id, legal_name, trade_name, country_code, crib_number, status, ov_employer_rate
) VALUES
  (
    '22222222-2222-4222-8222-222222222221',
    '11111111-1111-4111-8111-111111111111',
    'Great Bay Provisions N.V.',
    'Great Bay Provisions',
    'SXM',
    'CRIB-DEMO-001',
    'active',
    NULL
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'Simpson Bay Charters N.V.',
    'Simpson Bay Charters',
    'SXM',
    'CRIB-DEMO-002',
    'active',
    0.02000000
  ),
  (
    '22222222-2222-4222-8222-222222222223',
    '11111111-1111-4111-8111-111111111112',
    'Other Tenant N.V.',
    'Other Tenant',
    'SXM',
    'CRIB-DEMO-003',
    'active',
    NULL
  );

INSERT INTO allyanna.users (id, email, display_name) VALUES
  ('33333333-3333-4333-8333-333333333333', 'demo@allyanna.local', 'Demo Bookkeeper'),
  ('33333333-3333-4333-8333-333333333334', 'other@allyanna.local', 'Other Bookkeeper');

INSERT INTO allyanna.master_account_members (id, master_account_id, user_id, role) VALUES
  (
    '55555555-5555-4555-8555-555555555551',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    'owner'
  ),
  (
    '55555555-5555-4555-8555-555555555552',
    '11111111-1111-4111-8111-111111111112',
    '33333333-3333-4333-8333-333333333334',
    'owner'
  );

INSERT INTO allyanna.api_keys (id, user_id, key_hash, label) VALUES
  (
    '44444444-4444-4444-8444-444444444441',
    '33333333-3333-4333-8333-333333333333',
    encode(public.digest('allyanna-dev-key', 'sha256'), 'hex'),
    'local-development'
  ),
  (
    '44444444-4444-4444-8444-444444444442',
    '33333333-3333-4333-8333-333333333334',
    encode(public.digest('allyanna-other-key', 'sha256'), 'hex'),
    'local-development-other-firm'
  );
