import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

/** @type {import('pg').Pool | null} */
let pgPool = null;
/** @type {import('@electric-sql/pglite').PGlite | null} */
let pglite = null;
let mode = null;

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
    console.log(`[db] Using embedded PGlite at ${dataDir}`);
  }

  return { mode, query, exec };
}

/**
 * @param {string} text
 * @param {unknown[]} [params]
 */
export async function query(text, params = []) {
  await getDb();
  if (mode === 'postgres') {
    const result = await pgPool.query(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }
  const result = await pglite.query(text, params);
  return { rows: result.rows ?? [], rowCount: result.affectedRows ?? result.rows?.length ?? 0 };
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
  if (mode === 'postgres') {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
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
    const txQuery = async (text, params = []) => {
      const result = await pglite.query(text, params);
      return { rows: result.rows ?? [], rowCount: result.affectedRows ?? result.rows?.length ?? 0 };
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
