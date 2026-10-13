import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, exec, query, migrationsDir } from './db/client.js';
import { ensureDemoUser } from './services/auth.js';
import { resolveJwtSecret } from './services/jwtSecret.js';
import { emailTransportName } from './services/email.js';
import { ensureDemoMasterGraph } from './services/masterTenant.js';
import authRouter from './routes/auth.js';
import bidsRouter from './routes/bids.js';
import opsRouter from './routes/ops.js';
import publicProposalsRouter from './routes/publicProposals.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);

// Resolve JWT before accepting traffic (throws in production if weak/missing)
resolveJwtSecret();

app.use(cors());
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: true }));

const signaturesDir = path.resolve(__dirname, '../data/signatures');
const qaDir = path.resolve(__dirname, '../data/qa-photos');
const insuranceDir = path.resolve(__dirname, '../data/insurance');
fs.mkdirSync(signaturesDir, { recursive: true });
fs.mkdirSync(qaDir, { recursive: true });
fs.mkdirSync(insuranceDir, { recursive: true });
app.use('/signatures', express.static(signaturesDir));
app.use('/qa-photos', express.static(qaDir));
app.use('/insurance', express.static(insuranceDir));

app.get('/', (_req, res) => {
  res.json({
    name: 'OmniClean AI Scanner API',
    auth: 'POST /api/auth/login | /api/auth/register',
    scan: 'POST /api/scan (Bearer JWT)',
    portal: 'GET /p/:token',
    pdf: 'GET /api/bids/:id/proposal.pdf | /p/:token/pdf',
    email_transport: emailTransportName(),
  });
});

app.use('/api/auth', authRouter);
app.use(publicProposalsRouter);
app.use('/api', bidsRouter);
app.use('/api', opsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(err.geofence_violation ? { geofence_violation: true } : {}),
  });
});

async function ensureMigrated() {
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
    console.log(`[boot] migrate ${file}`);
    await exec(cleaned);
    await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
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
}

async function main() {
  await ensureMigrated();
  app.listen(PORT, () => {
    console.log(`OmniClean API listening on http://localhost:${PORT}`);
    console.log(
      `OpenAI vision: ${process.env.OPENAI_API_KEY?.trim() ? 'enabled' : 'mock fallback'}`
    );
    console.log(`Email transport: ${emailTransportName()}`);
    console.log('Demo login: demo@omniclean.demo / demo1234');
  });
}

main().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
