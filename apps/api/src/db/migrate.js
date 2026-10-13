import fs from 'node:fs';
import path from 'node:path';
import { exec, getDb, migrationsDir, query } from './client.js';

async function migrate() {
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
    if (rows.length) {
      console.log(`[migrate] skip ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`[migrate] apply ${file}`);
    await exec(sql);
    await query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }

  console.log('[migrate] done');
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
