import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { getTenantContext } from './tenantContext.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

/** @type {import('pg').Pool | null} */
let pgPool = null;
/** @type {import('@electric-sql/pglite').PGlite | null} */
let pglite = null;
let mode = null;

/** True when RLS session GUCs are applied (Postgres always; PGlite when supported). */
let rlsSessionSupported = null;

/**
 * Unified query interface for pg Pool or PGlite.
 */
export async function getDb() {
  if (mode) return { mode, query, exec };
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (databaseUrl) {
    const pg = await import('pg');
    pgPool = new pg.default.Pool({ connectionString: databaseUrl });
    mode = 'postgres';
    rlsSessionSupported = true;
    console.log('[db] Connected via PostgreSQL (DATABASE_URL)');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dataDir =
      process.env.PGLITE_DATA_DIR ||
      path.join(rootDir, 'data', 'omniclean.pglite');
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    pglite = new PGlite(dataDir);
    await pglite.waitReady;
    mode = 'pglite';
    rlsSessionSupported = await probePgliteRlsSupport();
    console.log(
      `[db] Using embedded PGlite at ${dataDir} (rls_session=${rlsSessionSupported})`
    );
  }

  return { mode, query, exec };
}

export function getDbMode() {
  return mode;
}

export function isRlsSessionSupported() {
  return Boolean(rlsSessionSupported);
}

/**
 * PGlite accepts ENABLE ROW LEVEL SECURITY + set_config, but often does **not**
 * enforce policies (catalog flags true, rows still visible cross-tenant).
 * Probe actual isolation; if policies don't filter, skip GUCs (app WHERE remains).
 */
async function probePgliteRlsSupport() {
  if (process.env.PGLITE_RLS === 'false') return false;
  if (process.env.PGLITE_RLS === 'true') return true;
  try {
    await pglite.exec(`
      CREATE TABLE IF NOT EXISTS _omniclean_rls_probe (
        id INT PRIMARY KEY,
        tenant_id INT NOT NULL
      );
      ALTER TABLE _omniclean_rls_probe ENABLE ROW LEVEL SECURITY;
      ALTER TABLE _omniclean_rls_probe FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS _omniclean_rls_probe_pol ON _omniclean_rls_probe;
      CREATE POLICY _omniclean_rls_probe_pol ON _omniclean_rls_probe
        FOR ALL
        USING (
          current_setting('app.rls_bypass', true) = 'on'
          OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::int
        );
    `);
    await pglite.exec('BEGIN');
    await pglite.query(`SELECT set_config('app.rls_bypass', 'on', true)`);
    await pglite.query(
      `INSERT INTO _omniclean_rls_probe (id, tenant_id) VALUES (1, 1)
       ON CONFLICT (id) DO UPDATE SET tenant_id = 1`
    );
    await pglite.exec('COMMIT');

    await pglite.exec('BEGIN');
    await pglite.query(`SELECT set_config('app.rls_bypass', 'off', true)`);
    await pglite.query(`SELECT set_config('app.tenant_id', '2', true)`);
    const visible = await pglite.query(
      `SELECT count(*)::int AS c FROM _omniclean_rls_probe`
    );
    await pglite.exec('COMMIT');

    const count = Number(visible.rows?.[0]?.c ?? 0);
    if (count === 0) {
      console.log('[db] PGlite RLS policy enforcement confirmed');
      return true;
    }
    console.warn(
      '[db] PGlite RLS not enforced (policies present but cross-tenant rows visible). Migration 009 still applies for Postgres; app-level tenant_id filters remain the isolation layer on PGlite.'
    );
    return false;
  } catch (err) {
    console.warn(
      '[db] PGlite RLS probe failed — app-level tenant filters only:',
      err.message
    );
    return false;
  }
}

/**
 * Resolve effective RLS context.
 * HTTP requests always have ALS (index.js). CLI/tests without ALS → bypass
 * so migrations/seeds keep working; authenticated routes set tenantId from JWT.
 */
function effectiveTenantContext() {
  const ctx = getTenantContext();
  if (ctx) return ctx;
  // No ALS store = system/script path (not an HTTP request)
  return { bypass: true };
}

/**
 * Apply app.tenant_id / app.rls_bypass on a live client (transaction-local).
 * @param {{ query: (text: string, params?: unknown[]) => Promise<unknown> }} client
 */
export async function applyTenantGucs(client) {
  if (rlsSessionSupported === false) return;
  const ctx = effectiveTenantContext();
  if (ctx.bypass) {
    await client.query(`SELECT set_config('app.rls_bypass', 'on', true)`);
  } else {
    await client.query(`SELECT set_config('app.rls_bypass', 'off', true)`);
  }
  if (ctx.tenantId != null && Number.isFinite(Number(ctx.tenantId))) {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
      String(Number(ctx.tenantId)),
    ]);
  }
  if (ctx.userId != null && Number.isFinite(Number(ctx.userId))) {
    await client.query(`SELECT set_config('app.user_id', $1, true)`, [
      String(Number(ctx.userId)),
    ]);
  }
}

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params = []) {
  await getDb();
  const ctx = effectiveTenantContext();
  const needsGuc =
    rlsSessionSupported && (ctx.bypass || ctx.tenantId != null);

  if (mode === 'postgres') {
    if (!needsGuc) {
      const result = await pgPool.query(text, params);
      return { rows: result.rows, rowCount: result.rowCount };
    }
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await applyTenantGucs(client);
      const result = await client.query(text, params);
      await client.query('COMMIT');
      return { rows: result.rows, rowCount: result.rowCount };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  // PGlite — single connection; use a short transaction when GUCs apply
  if (!needsGuc) {
    const result = await pglite.query(text, params);
    return {
      rows: result.rows ?? [],
      rowCount: result.affectedRows ?? result.rows?.length ?? 0,
    };
  }
  await pglite.exec('BEGIN');
  try {
    await applyTenantGucs({
      query: (t, p = []) => pglite.query(t, p),
    });
    const result = await pglite.query(text, params);
    await pglite.exec('COMMIT');
    return {
      rows: result.rows ?? [],
      rowCount: result.affectedRows ?? result.rows?.length ?? 0,
    };
  } catch (err) {
    try {
      await pglite.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Run raw SQL (migrations) without parameters.
 * @param {string} sql
 */
export async function exec(sql) {
  await getDb();
  if (mode === 'postgres') {
    await pgPool.query(sql);
    return;
  }
  await pglite.exec(sql);
}

export async function withTransaction(fn) {
  await getDb();
  // Nested query() must not open a second transaction on the same connection.
  // GUCs are applied once on this transaction client; txQuery talks to it directly.
  if (mode === 'postgres') {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      await applyTenantGucs(client);
      const txQuery = async (text, params = []) => {
        const result = await client.query(text, params);
        return { rows: result.rows, rowCount: result.rowCount };
      };
      const out = await fn(txQuery);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  await pglite.exec('BEGIN');
  try {
    await applyTenantGucs({
      query: (t, p = []) => pglite.query(t, p),
    });
    const txQuery = async (text, params = []) => {
      const result = await pglite.query(text, params);
      return {
        rows: result.rows ?? [],
        rowCount: result.affectedRows ?? result.rows?.length ?? 0,
      };
    };
    const out = await fn(txQuery);
    await pglite.exec('COMMIT');
    return out;
  } catch (err) {
    await pglite.exec('ROLLBACK');
    throw err;
  }
}

export function migrationsDir() {
  return path.join(rootDir, 'migrations');
}
