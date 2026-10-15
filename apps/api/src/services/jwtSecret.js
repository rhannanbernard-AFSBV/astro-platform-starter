import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, '../..');
const LOCAL_SECRET_FILE = path.join(apiRoot, 'data', '.jwt_secret');

const WEAK_DEFAULTS = new Set([
  'omniclean-dev-secret-change-me',
  'change-me',
  'change-me-in-production',
  'secret',
  'jwt_secret',
  'dev',
  'test',
]);

/**
 * Resolve JWT secret with hardening:
 * - Non-dev (NODE_ENV=production or OMNI_ENV=production): require strong JWT_SECRET (min 32 chars, not weak).
 * - Local/dev: use JWT_SECRET if strong enough; else load/generate data/.jwt_secret (gitignored).
 * Never commits a production secret.
 */
export function resolveJwtSecret() {
  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  const omniEnv = (process.env.OMNI_ENV || '').toLowerCase();
  const isProd =
    nodeEnv === 'production' ||
    omniEnv === 'production' ||
    process.env.REQUIRE_STRONG_JWT === 'true';

  const fromEnv = process.env.JWT_SECRET?.trim() || '';

  if (isProd) {
    assertStrongSecret(fromEnv, 'production');
    return fromEnv;
  }

  // Explicit allow for ephemeral test runners only
  if (process.env.ALLOW_INSECURE_JWT === 'true' && fromEnv) {
    console.warn(
      '[jwt] ALLOW_INSECURE_JWT=true — using provided JWT_SECRET without strength checks (dev/test only)'
    );
    return fromEnv;
  }

  if (fromEnv && isStrongSecret(fromEnv)) {
    return fromEnv;
  }

  if (fromEnv && !isStrongSecret(fromEnv)) {
    console.warn(
      '[jwt] JWT_SECRET is weak or placeholder — generating a local secret in data/.jwt_secret instead'
    );
  }

  return loadOrCreateLocalSecret();
}

function isStrongSecret(secret) {
  if (!secret || secret.length < 32) return false;
  if (WEAK_DEFAULTS.has(secret.toLowerCase())) return false;
  if (/^(.)\1+$/.test(secret)) return false;
  return true;
}

function assertStrongSecret(secret, context) {
  if (!isStrongSecret(secret)) {
    throw new Error(
      `JWT_SECRET is required and must be a strong secret (≥32 chars, not a placeholder) for ${context}. ` +
        `Generate one with: openssl rand -base64 48`
    );
  }
}

function loadOrCreateLocalSecret() {
  fs.mkdirSync(path.dirname(LOCAL_SECRET_FILE), { recursive: true });
  if (fs.existsSync(LOCAL_SECRET_FILE)) {
    const existing = fs.readFileSync(LOCAL_SECRET_FILE, 'utf8').trim();
    if (isStrongSecret(existing)) {
      console.log('[jwt] Using local secret from data/.jwt_secret (dev)');
      return existing;
    }
  }
  const generated = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(LOCAL_SECRET_FILE, generated + '\n', { mode: 0o600 });
  console.log(
    '[jwt] Generated strong local JWT secret → apps/api/data/.jwt_secret (gitignored; do not commit)'
  );
  return generated;
}

export { isStrongSecret, WEAK_DEFAULTS };
