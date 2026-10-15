/**
 * Refresh non-peg FX rates in global_exchange_rates.
 * Pegged currencies (is_fixed_peg) are left untouched.
 *
 * Usage: node src/jobs/fxRefresh.js
 * Optional: FX_REFRESH_URL pointing at a JSON feed
 *   { "rates": { "EUR": 0.92, "CAD": 1.36, "GBP": 0.79 } }  // units per 1 USD
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, query, exec, migrationsDir } from '../db/client.js';
import { log } from '../services/logger.js';

dotenv.config();

/** Conservative fallbacks when no live feed is configured (demo/ops). */
const FALLBACK_TO_USD = {
  EUR: 0.92,
  CAD: 1.36,
  GBP: 0.79,
};

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
    await exec(cleaned);
    await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }
}

async function fetchLiveRates() {
  const url = process.env.FX_REFRESH_URL?.trim();
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FX feed HTTP ${res.status}`);
  }
  const body = await res.json();
  return body.rates || body;
}

export async function refreshNonPegRates({ dryRun = false } = {}) {
  await ensureMigrated();
  let rates = await fetchLiveRates();
  const source = rates ? 'FX_REFRESH_URL' : 'fallback_seed';
  if (!rates) rates = FALLBACK_TO_USD;

  const { rows } = await query(
    `SELECT currency_code, exchange_rate_to_usd, is_fixed_peg
     FROM global_exchange_rates
     WHERE currency_code <> 'USD'`
  );

  const updates = [];
  for (const row of rows) {
    if (row.is_fixed_peg) continue;
    const next = rates[row.currency_code];
    if (next == null || !Number.isFinite(Number(next)) || Number(next) <= 0) {
      continue;
    }
    updates.push({
      currency_code: row.currency_code,
      from: Number(row.exchange_rate_to_usd),
      to: Number(next),
    });
    if (!dryRun) {
      await query(
        `UPDATE global_exchange_rates
         SET exchange_rate_to_usd = $1, updated_at = CURRENT_TIMESTAMP
         WHERE currency_code = $2 AND is_fixed_peg = FALSE`,
        [Number(next), row.currency_code]
      );
    }
  }

  log.info('fx_refresh_complete', {
    source,
    dry_run: dryRun,
    updated: updates.length,
    updates,
  });
  return { source, dry_run: dryRun, updates };
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('fxRefresh.js') ||
    process.argv[1].includes('fxRefresh'));

if (isMain) {
  refreshNonPegRates({ dryRun: process.argv.includes('--dry-run') })
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
