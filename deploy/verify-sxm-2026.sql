-- Confirm 2026 SXM tax seed is present (run as allyanna_app or owner).
-- Expected: TOT, WAGE_TAX, SZV, WAGE_TAX_MONTHLY for tax_year=2026.

\echo '=== Schedules ==='
SELECT schedule_code, calculation_method, amount_period, currency_code, effective_from, effective_to
FROM allyanna.tax_schedules
WHERE country_code = 'SXM' AND tax_year = 2026
ORDER BY schedule_code;

\echo '=== TOT rate (must come from table, not code) ==='
SELECT r.rate
FROM allyanna.tot_rates r
JOIN allyanna.tax_schedules s ON s.id = r.tax_schedule_id
WHERE s.country_code = 'SXM' AND s.tax_year = 2026 AND s.schedule_code = 'TOT';

\echo '=== Wage-tax bracket count ==='
SELECT COUNT(*) AS wage_brackets
FROM allyanna.wage_tax_brackets b
JOIN allyanna.tax_schedules s ON s.id = b.tax_schedule_id
WHERE s.country_code = 'SXM' AND s.tax_year = 2026 AND s.schedule_code = 'WAGE_TAX';

\echo '=== SZV components ==='
SELECT c.component_code, c.employee_rate, c.employer_rate, c.monthly_wage_ceiling
FROM allyanna.szv_components c
JOIN allyanna.tax_schedules s ON s.id = c.tax_schedule_id
WHERE s.country_code = 'SXM' AND s.tax_year = 2026
ORDER BY c.component_order;

\echo '=== Monthly wage-tax schedule present? ==='
SELECT schedule_code, calculation_method
FROM allyanna.tax_schedules
WHERE country_code = 'SXM' AND tax_year = 2026 AND schedule_code = 'WAGE_TAX_MONTHLY';

\echo '=== Demo API key hashes (should be ZERO rows in production) ==='
SELECT id, label
FROM allyanna.api_keys
WHERE id IN (
  '44444444-4444-4444-8444-444444444441',
  '44444444-4444-4444-8444-444444444442'
);
