import { getDb, query } from './client.js';

async function seed() {
  await getDb();

  // Ensure demo tenant + currency settings exist even if migration seed was partial
  const tenant = await query('SELECT tenant_id FROM tenants WHERE tenant_id = 1');
  if (!tenant.rows.length) {
    await query(
      `INSERT INTO tenants (tenant_id, name, jurisdiction_code, company_email)
       VALUES (1, 'OmniClean Demo (SXM)', 'SXM', 'bids@omniclean.demo')`
    );
  }

  const settings = await query(
    'SELECT tenant_setting_id FROM tenant_currency_settings WHERE tenant_id = 1'
  );
  if (!settings.rows.length) {
    await query(
      `INSERT INTO tenant_currency_settings (
        tenant_id, primary_currency_code, enable_dual_quoting, secondary_currency_code,
        custom_markup_percentage, base_hourly_wage, target_margin_percentage,
        shifts_per_year, facility_density_code
      ) VALUES (1, 'USD', TRUE, 'XCG', 0.00, 18.00, 30.00, 260, 'office_low')`
    );
  }

  const xcg = await query(
    `SELECT currency_code FROM global_exchange_rates WHERE currency_code = 'XCG'`
  );
  if (!xcg.rows.length) {
    await query(
      `INSERT INTO global_exchange_rates (currency_code, currency_symbol, exchange_rate_to_usd, is_fixed_peg)
       VALUES ('XCG', 'Cg', 1.7900, TRUE)`
    );
  } else {
    await query(
      `UPDATE global_exchange_rates
       SET currency_symbol = 'Cg', exchange_rate_to_usd = 1.7900, is_fixed_peg = TRUE,
           last_updated_at = CURRENT_TIMESTAMP
       WHERE currency_code = 'XCG'`
    );
  }

  console.log('[seed] demo tenant=1, XCG peg=1.7900 USD');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
