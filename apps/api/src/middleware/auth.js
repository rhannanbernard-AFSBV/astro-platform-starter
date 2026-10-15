import { verifyToken } from '../services/auth.js';
import {
  getTenantContext,
  runWithTenantContext,
} from '../db/tenantContext.js';

/**
 * Bind JWT claims onto the request-scoped ALS store (started in index.js).
 */
function bindTenantFromJwt(req, payload) {
  req.user = {
    user_id: Number(payload.sub),
    tenant_id: Number(payload.tenant_id),
    email: payload.email,
    role: payload.role,
    is_master: Boolean(payload.is_master),
    home_tenant_id: Number(payload.home_tenant_id || payload.tenant_id),
  };
  req.tenantId = Number(payload.tenant_id);
  const ctx = getTenantContext();
  if (ctx) {
    ctx.tenantId = req.tenantId;
    ctx.userId = req.user.user_id;
    ctx.bypass = false;
  }
}

/**
 * Require Bearer JWT. Sets req.user and req.tenantId from the token claims.
 * Ignores spoofable X-Tenant-Id for authorization.
 * Mutates AsyncLocalStorage tenant context so DB queries set app.tenant_id (RLS).
 */
export function requireAuth(req, res, next) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ error: 'Authorization Bearer token required' });
  }
  const payload = verifyToken(match[1].trim());
  if (!payload?.tenant_id || !payload?.sub) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  bindTenantFromJwt(req, payload);
  if (!getTenantContext()) {
    return runWithTenantContext(
      { tenantId: req.tenantId, userId: req.user.user_id },
      () => next()
    );
  }
  next();
}

/**
 * Require one of the given roles (or is_master). Must run after requireAuth.
 * @param {...string} roles e.g. 'admin'
 */
export function requireRole(...roles) {
  const allowed = new Set(roles.map((r) => String(r).toLowerCase()));
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    if (req.user.is_master) {
      return next();
    }
    const role = String(req.user.role || '').toLowerCase();
    if (allowed.has(role)) {
      return next();
    }
    return res.status(403).json({
      error: `Requires role: ${[...allowed].join(' | ')}`,
      code: 'ROLE_FORBIDDEN',
    });
  };
}

/** Optional auth — if present, bind tenant from JWT; else leave unset */
export function optionalAuth(req, _res, next) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const payload = verifyToken(match[1].trim());
    if (payload?.tenant_id && payload?.sub) {
      bindTenantFromJwt(req, payload);
      if (!getTenantContext()) {
        return runWithTenantContext(
          { tenantId: req.tenantId, userId: req.user.user_id },
          () => next()
        );
      }
    }
  }
  next();
}

/**
 * Mark this request as RLS-bypass (login/register, public portal, boot).
 * Must run inside the root ALS middleware from index.js.
 */
export function rlsBypass(_req, _res, next) {
  const ctx = getTenantContext();
  if (ctx) {
    ctx.bypass = true;
    return next();
  }
  return runWithTenantContext({ bypass: true }, () => next());
}
