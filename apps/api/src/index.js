import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getDb,
  exec,
  query,
  migrationsDir,
  isRlsSessionSupported,
  getDbMode,
} from './db/client.js';
import { runWithTenantContext, withRlsBypass } from './db/tenantContext.js';
import { ensureDemoUser } from './services/auth.js';
import { resolveJwtSecret } from './services/jwtSecret.js';
import { emailTransportName } from './services/email.js';
import { ensureDemoMasterGraph } from './services/masterTenant.js';
import { providerStatus } from './services/providers.js';
import {
  apiRateLimit,
  authRateLimit,
  buildCorsOptions,
  publicProposalRateLimit,
} from './middleware/security.js';
import { protectedStatic } from './middleware/protectedStatic.js';
import { getMetricsSnapshot, log, requestLogMiddleware } from './services/logger.js';
import authRouter from './routes/auth.js';
import bidsRouter from './routes/bids.js';
import opsRouter from './routes/ops.js';
import publicProposalsRouter from './routes/publicProposals.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const publicDir = path.resolve(__dirname, '../public');

// Resolve JWT before accepting traffic (throws in production if weak/missing)
resolveJwtSecret();

app.set('trust proxy', 1);
app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));
// Request-scoped ALS for app.tenant_id / RLS (mutated by requireAuth / rlsBypass)
app.use((req, res, next) => {
  runWithTenantContext({ bypass: false }, () => next());
});
app.use(requestLogMiddleware);
app.use('/api/', apiRateLimit);

const signaturesDir = path.resolve(__dirname, '../data/signatures');
const qaDir = path.resolve(__dirname, '../data/qa-photos');
const insuranceDir = path.resolve(__dirname, '../data/insurance');
fs.mkdirSync(signaturesDir, { recursive: true });
fs.mkdirSync(qaDir, { recursive: true });
fs.mkdirSync(insuranceDir, { recursive: true });
// Auth-gated artifacts: Bearer JWT or HMAC signed ?exp=&sig=
app.use('/signatures', protectedStatic(signaturesDir));
app.use('/qa-photos', protectedStatic(qaDir));
app.use('/insurance', protectedStatic(insuranceDir));

app.get('/', (_req, res) => {
  res.json({
    name: 'OmniClean AI Scanner API',
    demo: 'GET /demo/ (phone web trial — no Expo Go)',
    auth: 'POST /api/auth/login | /api/auth/register',
    scan: 'POST /api/scan (Bearer JWT)',
    portal: 'GET /p/:token',
    pdf: 'GET /api/bids/:id/proposal.pdf | /p/:token/pdf',
    metrics: 'GET /api/metrics',
    db_mode: getDbMode(),
    rls_session: isRlsSessionSupported(),
    ...providerStatus(),
  });
});

// Mobile-friendly web demo (same-origin API calls). Public, no auth on HTML.
app.use(
  '/demo',
  express.static(path.join(publicDir, 'demo'), {
    index: 'index.html',
    fallthrough: false,
  })
);

app.get('/api/metrics', (_req, res) => {
  res.json(getMetricsSnapshot());
});

app.use('/api/auth', authRateLimit, authRouter);
app.use(publicProposalRateLimit, publicProposalsRouter);
app.use('/api', bidsRouter);
app.use('/api', opsRouter);

app.use((err, _req, res, _next) => {
  log.error('request_error', {
    error: err.message,
    code: err.code,
    status: err.status,
  });
  const status = err.status || (err.message?.startsWith('CORS') ? 403 : 500);
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(err.code ? { code: err.code } : {}),
    ...(err.geofence_violation ? { geofence_violation: true } : {}),
    ...(err.qa_required ? { qa_required: true } : {}),
    ...(err.audit ? { audit: err.audit } : {}),
  });
});

async function ensureMigrated() {
  await getDb();
  // Boot / migrate / seed must bypass FORCE RLS (no JWT yet)
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
      console.log(`[boot] migrate ${file}`);
      await exec(cleaned);
      await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
        file,
      ]);
    }

    const t = await query('SELECT tenant_id FROM tenants WHERE tenant_id = 1');
    if (!t.rows.length) {
      await query(
        `INSERT INTO tenants (tenant_id, name, jurisdiction_code, company_email,
           insurance_liability_limit, insurance_notes)
         VALUES (1, 'OmniClean Demo (SXM)', 'SXM', 'bids@omniclean.demo',
           'USD 1,000,000 per occurrence',
           'Demo COI placeholder — replace with real certificate URL in Tenant Admin.')`
      );
    } else {
      await query(
        `UPDATE tenants SET
           insurance_liability_limit = COALESCE(insurance_liability_limit, 'USD 1,000,000 per occurrence'),
           insurance_notes = COALESCE(insurance_notes, 'Demo COI placeholder — replace with real certificate URL in Tenant Admin.')
         WHERE tenant_id = 1`
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

    await ensureDemoUser();
    await ensureDemoMasterGraph();

    // Explicit tenant_id inserts (1, 2, 100) leave SERIAL behind — fix before register
    await syncSerialSequences();
  });
}

/** Keep SERIAL sequences ahead of MAX(id) after seed/migrations with fixed PKs. */
async function syncSerialSequences() {
  const stmts = [
    `SELECT setval(pg_get_serial_sequence('tenants', 'tenant_id'),
       COALESCE((SELECT MAX(tenant_id) FROM tenants), 1))`,
    `SELECT setval(pg_get_serial_sequence('users', 'user_id'),
       COALESCE((SELECT MAX(user_id) FROM users), 1))`,
  ];
  for (const sql of stmts) {
    try {
      await query(sql);
    } catch (err) {
      console.warn('[boot] sequence sync skipped:', err.message);
    }
  }
}

async function main() {
  await ensureMigrated();
  const providers = providerStatus();
  app.listen(PORT, HOST, () => {
    log.info('api_listening', {
      host: HOST,
      port: PORT,
      demo: `http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}/demo/`,
      openai_configured: providers.openai_configured,
      vision_mock_allowed: providers.vision_mock_allowed,
      email_transport: emailTransportName(),
    });
  });
}

main().catch((err) => {
  log.error('boot_failed', { error: err.message });
  process.exit(1);
});
