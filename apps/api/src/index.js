import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { getDb, exec, query } from './db/client.js';
import { migrationsDir } from './db/client.js';
import fs from 'node:fs';
import path from 'node:path';
import { tenantMiddleware } from './middleware/tenant.js';
import bidsRouter from './routes/bids.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/', (_req, res) => {
  res.json({
    name: 'OmniClean AI Scanner API',
    docs: 'POST /api/scan — walkthrough → bid → checklist → proposal',
  });
});

app.use('/api', tenantMiddleware, bidsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
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
    // Skip setval line that may fail on PGlite — wrap softly
    const cleaned = sql
      .split('\n')
      .filter((line) => !/setval\(/i.test(line))
      .join('\n');
    console.log(`[boot] migrate ${file}`);
    await exec(cleaned);
    await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }

  // Ensure demo tenant settings
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
}

async function main() {
  await ensureMigrated();
  app.listen(PORT, () => {
    console.log(`OmniClean API listening on http://localhost:${PORT}`);
    console.log(
      `OpenAI vision: ${process.env.OPENAI_API_KEY?.trim() ? 'enabled' : 'mock fallback (set OPENAI_API_KEY)'}`
    );
  });
}

main().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
