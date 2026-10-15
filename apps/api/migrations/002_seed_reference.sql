-- Reference seed (idempotent via ON CONFLICT)

INSERT INTO jurisdiction_tax_settings (
  jurisdiction_code, country_name, tot_rate, labor_burden_multiplier,
  consumables_rate, default_margin_rate, notes
) VALUES (
  'SXM', 'Sint Maarten', 0.0500, 1.1200, 0.0250, 0.3000,
  'BBO/TOT 5% flat turnover tax; SZV employer burden ~1.09–1.20'
) ON CONFLICT (jurisdiction_code) DO NOTHING;

INSERT INTO issa_production_rates (density_code, label, sq_ft_per_hour, description) VALUES
  ('office_low', 'Low-density office', 3500.00, 'Open office, light traffic'),
  ('office_high', 'High-density office', 2500.00, 'Cubicles / high touchpoints'),
  ('medical_clinic', 'Medical / clinic', 1800.00, 'High-traffic clinical spaces'),
  ('retail', 'Retail floor', 2800.00, 'Retail sales floor')
ON CONFLICT (density_code) DO NOTHING;

INSERT INTO global_exchange_rates (currency_code, currency_symbol, exchange_rate_to_usd, is_fixed_peg) VALUES
  ('USD', '$', 1.0000, TRUE),
  ('XCG', 'Cg', 1.7900, TRUE),
  ('EUR', '€', 0.9200, FALSE),
  ('CAD', 'C$', 1.3600, FALSE),
  ('GBP', '£', 0.7900, FALSE)
ON CONFLICT (currency_code) DO NOTHING;

INSERT INTO tenants (tenant_id, name, jurisdiction_code, company_email)
VALUES (1, 'OmniClean Demo (SXM)', 'SXM', 'bids@omniclean.demo')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenant_currency_settings (
  tenant_id, primary_currency_code, enable_dual_quoting, secondary_currency_code,
  custom_markup_percentage, base_hourly_wage, target_margin_percentage,
  shifts_per_year, facility_density_code
) VALUES (
  1, 'USD', TRUE, 'XCG', 0.00, 18.00, 30.00, 260, 'office_low'
) ON CONFLICT (tenant_id) DO NOTHING;
