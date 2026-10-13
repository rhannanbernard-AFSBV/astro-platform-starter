import { verifyToken } from '../services/auth.js';

/**
 * Require Bearer JWT. Sets req.user and req.tenantId from the token claims.
 * Ignores spoofable X-Tenant-Id for authorization.
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
  req.user = {
    user_id: Number(payload.sub),
    tenant_id: Number(payload.tenant_id),
    email: payload.email,
    role: payload.role,
    is_master: Boolean(payload.is_master),
    home_tenant_id: Number(payload.home_tenant_id || payload.tenant_id),
  };
  req.tenantId = Number(payload.tenant_id);
  next();
}

/** Optional auth — if present, bind tenant from JWT; else leave unset */
export function optionalAuth(req, _res, next) {
  const header = req.header('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const payload = verifyToken(match[1].trim());
    if (payload?.tenant_id && payload?.sub) {
      req.user = {
        user_id: Number(payload.sub),
        tenant_id: Number(payload.tenant_id),
        email: payload.email,
        role: payload.role,
        is_master: Boolean(payload.is_master),
        home_tenant_id: Number(payload.home_tenant_id || payload.tenant_id),
      };
      req.tenantId = Number(payload.tenant_id);
    }
  }
  next();
}
