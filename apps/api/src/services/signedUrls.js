import crypto from 'node:crypto';
import { resolveJwtSecret } from './jwtSecret.js';

/**
 * HMAC-signed URLs for /qa-photos, /signatures, /insurance artifacts.
 * Query: ?exp=<unix>&sig=<hex>
 */

const ALLOWED_PREFIXES = ['/qa-photos/', '/signatures/', '/insurance/'];

function signingKey() {
  return process.env.FILE_URL_SIGNING_SECRET?.trim() || resolveJwtSecret();
}

function publicBaseUrl() {
  return (
    process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ||
    `http://localhost:${process.env.PORT || 4000}`
  );
}

export function isProtectedStaticPath(pathname) {
  return ALLOWED_PREFIXES.some((p) => pathname.startsWith(p));
}

export function signStaticPath(pathname, ttlSeconds = 3600) {
  if (!pathname?.startsWith('/')) {
    throw new Error('pathname must start with /');
  }
  if (!isProtectedStaticPath(pathname)) {
    throw new Error(`Refusing to sign unprotected path ${pathname}`);
  }
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, Number(ttlSeconds) || 3600);
  const payload = `${pathname}:${exp}`;
  const sig = crypto
    .createHmac('sha256', signingKey())
    .update(payload)
    .digest('hex');
  return { pathname, exp, sig, query: `exp=${exp}&sig=${sig}` };
}

/** Absolute signed URL for portal / email clients */
export function signedAbsoluteUrl(pathname, ttlSeconds = 86400) {
  if (!pathname) return null;
  if (pathname.startsWith('http://') || pathname.startsWith('https://')) {
    return pathname;
  }
  const { query } = signStaticPath(pathname, ttlSeconds);
  return `${publicBaseUrl()}${pathname}?${query}`;
}

export function verifySignedQuery(pathname, exp, sig) {
  if (!pathname || !exp || !sig) return false;
  if (!isProtectedStaticPath(pathname)) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const payload = `${pathname}:${expNum}`;
  const expected = crypto
    .createHmac('sha256', signingKey())
    .update(payload)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(sig), 'utf8'),
      Buffer.from(expected, 'utf8')
    );
  } catch {
    return false;
  }
}
