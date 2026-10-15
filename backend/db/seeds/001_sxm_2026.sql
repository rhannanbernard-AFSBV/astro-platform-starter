-- Sint Maarten (SXM) 2026 reference rows and a local demo firm.
-- Rates below are seed data. Calculation code must read them back from these tables.
--
-- Sources:
-- - Turnover tax: statutory flat tax on gross taxable revenue, published at 5%.
-- - Wage tax: AB 2026, no. 11 schijventarief (annual step brackets with published
--   base tax). This is not the monthly loonbelasting lookup table.
-- - AOV/AWW ceilings: SZV notice effective 1 January 2026. Monthly maximum
--   Cg 10,928.01 (article 26/29 paragraph 4). Annual maximum Cg 132,824.35
--   (paragraph 3). The monthly calculator uses the monthly ceiling, not annual/12.
-- - AOV/AWW splits: SZV premium sheet, employer/employee AOV 7%/6% and AWW 0.5%/0.5%.
--   The 2026 wage-tax grondslagen note assumes the employee AOV/AWW share stays 6.5%.
-- - ZV: employer 8.3%, employee 4.2%. OV: employer 0.5% to 5% by risk class, employee 0.
--   The stored OV employer rate is the statutory minimum.
-- - ZV/OV ceiling: Cg 10,000.00 per month and Cg 120,000.00 per year, in force from
--   1 August 2022. SZV's public wage-limit index showed no later ZV/OV amendment.
--   Amounts are stored in XCG (Caribbean guilder).

DELETE FROM allyanna.tax_schedules
WHERE country_code = 'SXM' AND tax_year = 2026;

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

INSERT INTO allyanna.tax_schedules (
  id, country_code, tax_year, schedule_code, calculation_method, amount_period,
  currency_code, lower_inclusive, upper_inclusive, effective_from, effective_to, source_note
) VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'SXM', 2026, 'TOT', 'flat_rate', 'transaction', 'XCG',
    false, true, DATE '2026-01-01', DATE '2026-12-31',
    'Statutory Sint Maarten turnover tax on gross taxable revenue. The rate is stored on tot_rates and must be read from that row.'
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'SXM', 2026, 'WAGE_TAX', 'progressive_step', 'year', 'XCG',
    false, true, DATE '2026-01-01', DATE '2026-12-31',
    'AB 2026, no. 11 schijventarief. Annual taxable wage (grondslag). Lower bound is exclusive and upper bound is inclusive. Published base-tax amounts are used as printed, including the small rounding difference from a pure running total. Not the monthly withholding lookup table.'
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'SXM', 2026, 'SZV', 'capped_split', 'month', 'XCG',
    false, true, DATE '2026-01-01', DATE '2026-12-31',
    'SZV ZV/OV and AOV/AWW employer/employee splits. Each component caps the monthly wage at its own monthly_wage_ceiling. OV employer_rate is the statutory minimum; employer_rate_min and employer_rate_max are the published risk-class band.'
  );

INSERT INTO allyanna.tot_rates (id, tax_schedule_id, rate) VALUES
  ('a2000000-0000-4000-8000-000000000010', 'a1000000-0000-4000-8000-000000000001', 0.05000000);

INSERT INTO allyanna.wage_tax_brackets (
  id, tax_schedule_id, bracket_order, income_from, income_to, rate, base_tax
) VALUES
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 1, 0.00, 36576.00, 0.12500000, 0.00),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 2, 36576.00, 54864.00, 0.20000000, 4571.95),
  ('a2000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 3, 54864.00, 76200.00, 0.26250000, 8229.49),
  ('a2000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000002', 4, 76200.00, 114297.00, 0.33750000, 13830.02),
  ('a2000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000002', 5, 114297.00, 161540.00, 0.40000000, 26688.11),
  ('a2000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000002', 6, 161540.00, NULL, 0.47500000, 45585.20);

INSERT INTO allyanna.szv_components (
  id, tax_schedule_id, component_order, component_code, group_code,
  employee_rate, employer_rate, monthly_wage_ceiling, annual_wage_ceiling,
  employer_rate_min, employer_rate_max, rate_is_variable
) VALUES
  (
    'a3000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000003',
    1, 'ZV', 'ZV_OV',
    0.04200000, 0.08300000, 10000.00, 120000.00,
    NULL, NULL, false
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000003',
    2, 'OV', 'ZV_OV',
    0.00000000, 0.00500000, 10000.00, 120000.00,
    0.00500000, 0.05000000, true
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'a1000000-0000-4000-8000-000000000003',
    3, 'AOV', 'AOV_AWW',
    0.06000000, 0.07000000, 10928.01, 132824.35,
    NULL, NULL, false
  ),
  (
    'a3000000-0000-4000-8000-000000000004',
    'a1000000-0000-4000-8000-000000000003',
    4, 'AWW', 'AOV_AWW',
    0.00500000, 0.00500000, 10928.01, 132824.35,
    NULL, NULL, false
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

-- Development keys. Plaintext values are allyanna-dev-key and allyanna-other-key.
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
