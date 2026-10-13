/**
 * Integration: mock scan → Decimal ledger snapshot persists in DB.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('scan → ledger integration', () => {
  before(async () => {
    process.env.ALLOW_INSECURE_JWT = 'true';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long!!';
    process.env.NODE_ENV = 'development';
    // Isolated PGlite for this suite
    const dataDir = path.resolve(__dirname, '../../data/test-integration.pglite');
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    process.env.PGLITE_DATA_DIR = dataDir;
    process.env.DATABASE_URL = '';

    const { getDb, exec, query, migrationsDir } = await import('../db/client.js');
    await getDb();
    await exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const dir = migrationsDir();
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const { rows } = await query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (rows.length) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      const cleaned = sql
        .split('\n')
        .filter((line) => !/setval\(/i.test(line))
        .join('\n');
      await exec(cleaned);
      await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
        file,
      ]);
    }

    const t = await query('SELECT tenant_id FROM tenants WHERE tenant_id = 1');
    if (!t.rows.length) {
      await query(
        `INSERT INTO tenants (tenant_id, name, jurisdiction_code, company_email)
         VALUES (1, 'OmniClean Demo (SXM)', 'SXM', 'bids@omniclean.demo')`
      );
    }
    const s = await query(
      'SELECT 1 FROM tenant_currency_settings WHERE tenant_id = 1'
    );
    if (!s.rows.length) {
      await query(
        `INSERT INTO tenant_currency_settings (
          tenant_id, primary_currency_code, enable_dual_quoting, secondary_currency_code,
          custom_markup_percentage, base_hourly_wage, target_margin_percentage,
          shifts_per_year, facility_density_code
        ) VALUES (1, 'USD', TRUE, 'XCG', 0.00, 18.00, 30.00, 260, 'office_low')`
      );
    }
  });

  it('creates bid with ledger matching Decimal chain', async () => {
    const { createBidFromWalkthrough } = await import('./bidService.js');
    const result = await createBidFromWalkthrough({
      tenantId: 1,
      clientName: 'Integration Test Client',
      propertyAddress: '1 Front Street, Philipsburg, SXM',
      frequency: '5x / week',
      hintSqFt: 10000,
      useMock: true,
    });

    const ledger = result.payload.financial_ledger;
    assert.ok(result.bid.bid_id);
    assert.equal(Number(result.bid.total_sq_ft), 10000);
    assert.ok(ledger.calculation_steps.length >= 5);
    assert.equal(Number(result.bid.monthly_price), ledger.recommended_monthly_invoice_price);
    assert.ok(ledger.recommended_monthly_invoice_price > 0);
    assert.ok(result.checklists.some((c) => c.is_high_risk));
    assert.ok(result.proposal.access_token);
    // Scan-facing payload should still have secure URL capability
    assert.ok(result.proposal.proposal_id);
  });
});
