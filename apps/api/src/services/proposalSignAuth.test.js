import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('proposal sign OTP hardening', () => {
  let query;
  let accessToken;
  let requestSignOtp;
  let verifySignOtp;
  let signProposal;

  before(async () => {
    process.env.ALLOW_INSECURE_JWT = 'true';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long!!';
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_EMAIL_DRY_RUN = 'true';
    process.env.PROPOSAL_SIGN_REQUIRE_OTP = 'true';
    const dataDir = path.resolve(__dirname, '../../data/test-sign-otp.pglite');
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    process.env.PGLITE_DATA_DIR = dataDir;
    process.env.DATABASE_URL = '';

    const db = await import('../db/client.js');
    query = db.query;
    await db.getDb();
    await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const dir = db.migrationsDir();
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
      await db.exec(cleaned);
      await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    }

    // Seed minimal tenant + rates if missing
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

    const { createBidFromWalkthrough } = await import('./bidService.js');
    const result = await createBidFromWalkthrough({
      tenantId: 1,
      clientName: 'OTP Client',
      propertyAddress: 'Test Ave',
      useMock: true,
      commitPricing: true,
    });
    accessToken = result.proposal.access_token;

    ({ requestSignOtp, verifySignOtp } = await import('./proposalSignAuth.js'));
    ({ signProposal } = await import('./proposalActions.js'));
  });

  it('rejects sign without OTP', async () => {
    await assert.rejects(
      () =>
        signProposal({
          accessToken,
          signerName: 'Alice',
          typedSignature: 'Alice',
        }),
      (err) => err.code === 'SIGN_AUTH_REQUIRED'
    );
  });

  it('OTP → one-time token → sign → revoke re-sign', async () => {
    const issued = await requestSignOtp({
      accessToken,
      signerEmail: 'client@example.com',
    });
    assert.ok(issued.dev_otp || issued.status === 'otp_sent');
    const otp = issued.dev_otp;
    assert.ok(otp);

    const verified = await verifySignOtp({ accessToken, otp });
    assert.ok(verified.sign_token);

    const signed = await signProposal({
      accessToken,
      signerName: 'Alice Client',
      signerEmail: 'client@example.com',
      typedSignature: 'Alice Client',
      signToken: verified.sign_token,
    });
    assert.equal(signed.proposal.status, 'Signed');

    // Re-sign blocked
    await assert.rejects(
      () =>
        signProposal({
          accessToken,
          signerName: 'Eve',
          typedSignature: 'Eve',
          otp: '000000',
        }),
      (err) =>
        err.code === 'PROPOSAL_TOKEN_REVOKED' ||
        err.status === 409 ||
        err.code === 'PROPOSAL_ALREADY_SIGNED'
    );
  });
});
