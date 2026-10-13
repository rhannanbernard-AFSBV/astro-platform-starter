/**
 * Multi-tenant isolation: every request must resolve a tenant_id.
 * Header: X-Tenant-Id (falls back to DEFAULT_TENANT_ID / 1 for demo).
 */
export function tenantMiddleware(req, _res, next) {
  const raw =
    req.header('x-tenant-id') ||
    req.query.tenant_id ||
    process.env.DEFAULT_TENANT_ID ||
    '1';
  const tenantId = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return next(Object.assign(new Error('Invalid tenant_id'), { status: 400 }));
  }
  req.tenantId = tenantId;
  next();
}
