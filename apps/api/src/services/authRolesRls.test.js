/**
 * #2 roles/register/demo-seed + #7 RLS session helpers
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireRole } from '../middleware/auth.js';
import {
  allowDemoSeed,
  isProductionEnv,
  runWithTenantContext,
  withRlsBypass,
} from '../db/tenantContext.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('roles + register + demo seed + RLS', () => {
  before(async () => {
    process.env.ALLOW_INSECURE_JWT = 'true';
    process.env.JWT_SECRET =
      process.env.JWT_SECRET || 'ci-test-secret-at-least-32-characters-long!!';
    process.env.NODE_ENV = 'development';
    process.env.OMNI_ENV = 'development';
    delete process.env.ALLOW_DEMO_SEED;
    delete process.env.ALLOW_OPEN_REGISTER_DEFAULT_TENANT;

    const dataDir = path.resolve(__dirname, '../../data/test-roles-rls.pglite');
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    process.env.PGLITE_DATA_DIR = dataDir;
    process.env.DATABASE_URL = '';

    const { getDb, exec, query, migrationsDir } = await import('../db/client.js');
    await getDb();
    await withRlsBypass(async () => {
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
  });

  it('requireRole allows admin and is_master; rejects member', () => {
    const mw = requireRole('admin');
    const allow = (user) =>
      new Promise((resolve) => {
        const req = { user };
        const res = {
          status(code) {
            this.statusCode = code;
            return this;
          },
          json(body) {
            resolve({ status: this.statusCode || 200, body });
          },
        };
        mw(req, res, () => resolve({ status: 200, ok: true }));
      });

    return Promise.all([
      allow({ role: 'admin', is_master: false }).then((r) =>
        assert.equal(r.status, 200)
      ),
      allow({ role: 'member', is_master: true }).then((r) =>
        assert.equal(r.status, 200)
      ),
      allow({ role: 'member', is_master: false }).then((r) => {
        assert.equal(r.status, 403);
        assert.equal(r.body.code, 'ROLE_FORBIDDEN');
      }),
    ]);
  });

  it('register without company_name or invite is rejected', async () => {
    const { registerUser } = await import('./auth.js');
    await assert.rejects(
      () =>
        registerUser({
          email: 'orphan@example.com',
          password: 'password123',
          fullName: 'No Company',
        }),
      (err) => err.code === 'REGISTER_REQUIRES_COMPANY_OR_INVITE'
    );
  });

  it('register with company_name creates tenant + admin user', async () => {
    const { query } = await import('../db/client.js');
    // Seed used fixed tenant_ids 1/2/100 — bump SERIAL like boot does
    await withRlsBypass(async () => {
      try {
        await query(
          `SELECT setval(pg_get_serial_sequence('tenants', 'tenant_id'),
             COALESCE((SELECT MAX(tenant_id) FROM tenants), 1))`
        );
      } catch {
        /* ignore */
      }
    });
    const { registerUser } = await import('./auth.js');
    const result = await registerUser({
      email: `co-${Date.now()}@example.com`,
      password: 'password123',
      fullName: 'Company Admin',
      createTenantName: 'New Cleaning Co',
    });
    assert.ok(result.token);
    assert.equal(result.user.role, 'admin');
    assert.ok(result.tenant.tenant_id > 1);
  });

  it('register with invite_code joins existing tenant as member', async () => {
    const { query } = await import('../db/client.js');
    const { registerUser } = await import('./auth.js');
    const code = `INVITE-${Date.now()}`;
    await withRlsBypass(async () => {
      await query(
        `INSERT INTO tenant_invites (tenant_id, code, role, max_uses)
         VALUES (1, $1, 'member', 5)`,
        [code]
      );
    });
    const result = await registerUser({
      email: `invited-${Date.now()}@example.com`,
      password: 'password123',
      fullName: 'Invited Member',
      inviteCode: code,
    });
    assert.equal(result.user.tenant_id, 1);
    assert.equal(result.user.role, 'member');
  });

  it('allowDemoSeed is false in production unless ALLOW_DEMO_SEED', () => {
    const prevOmni = process.env.OMNI_ENV;
    const prevNode = process.env.NODE_ENV;
    const prevAllow = process.env.ALLOW_DEMO_SEED;
    try {
      process.env.OMNI_ENV = 'production';
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_DEMO_SEED;
      assert.equal(isProductionEnv(), true);
      assert.equal(allowDemoSeed(), false);
      process.env.ALLOW_DEMO_SEED = 'true';
      assert.equal(allowDemoSeed(), true);
    } finally {
      process.env.OMNI_ENV = prevOmni;
      process.env.NODE_ENV = prevNode;
      if (prevAllow === undefined) delete process.env.ALLOW_DEMO_SEED;
      else process.env.ALLOW_DEMO_SEED = prevAllow;
    }
  });

  it('RLS tenant context isolates bids when session GUCs + policies enforce', async () => {
    const { query, isRlsSessionSupported, getDbMode } = await import(
      '../db/client.js'
    );
    const { createBidFromWalkthrough } = await import('./bidService.js');

    const bid = await runWithTenantContext({ tenantId: 1, userId: 1 }, () =>
      createBidFromWalkthrough({
        tenantId: 1,
        clientName: 'RLS Tenant1 Bid',
        propertyAddress: 'Philipsburg',
        frequency: '5x / week',
        hintSqFt: 5000,
        useMock: true,
        commitPricing: true,
      })
    );
    assert.ok(bid.bid.bid_id);

    // App-level filter always works
    const appFilter = await runWithTenantContext({ tenantId: 1 }, () =>
      query('SELECT bid_id FROM bids WHERE tenant_id = $1 AND bid_id = $2', [
        1,
        bid.bid.bid_id,
      ])
    );
    assert.equal(appFilter.rows.length, 1);

    if (!isRlsSessionSupported()) {
      // Expected on current PGlite: policies installed for Postgres parity but not enforced
      assert.equal(getDbMode(), 'pglite');
      return;
    }

    const visibleAsT1 = await runWithTenantContext({ tenantId: 1 }, () =>
      query('SELECT bid_id FROM bids WHERE bid_id = $1', [bid.bid.bid_id])
    );
    assert.equal(visibleAsT1.rows.length, 1);

    const hiddenAsT2 = await runWithTenantContext({ tenantId: 2 }, () =>
      query('SELECT bid_id FROM bids WHERE bid_id = $1', [bid.bid.bid_id])
    );
    assert.equal(hiddenAsT2.rows.length, 0);
  });
});
