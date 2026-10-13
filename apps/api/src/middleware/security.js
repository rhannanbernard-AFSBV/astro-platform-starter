import rateLimit from 'express-rate-limit';

/**
 * CORS lockdown — ALLOWED_ORIGINS comma-separated.
 * Empty in development → reflect request origin / allow all for local DX.
 * Production without ALLOWED_ORIGINS → deny browser cross-origin (same-origin API still OK).
 */
export function buildCorsOptions() {
  const raw = process.env.ALLOWED_ORIGINS?.trim();
  const isProd =
    (process.env.NODE_ENV || '').toLowerCase() === 'production' ||
    (process.env.OMNI_ENV || '').toLowerCase() === 'production';

  if (!raw) {
    if (isProd) {
      console.warn(
        '[cors] ALLOWED_ORIGINS unset in production — browser CORS disabled (set explicit origins)'
      );
      return {
        origin: false,
        credentials: true,
      };
    }
    return { origin: true, credentials: true };
  }

  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    origin(origin, cb) {
      // Non-browser / same-origin tools often omit Origin
      if (!origin) return cb(null, true);
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin ${origin}`));
    },
    credentials: true,
  };
}

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AUTH_MAX || 30),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts — try again later' },
});

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_API_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded — slow down' },
});

export const scanRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_SCAN_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many scans — try again later' },
});

export const publicProposalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PUBLIC_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many portal requests' },
});
