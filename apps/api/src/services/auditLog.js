import { query } from '../db/client.js';

/**
 * Persist sensitive-action audit rows (login, scan, send, sign, admin, switch).
 */
export async function writeAuditLog({
  tenantId,
  userId,
  action,
  resourceType,
  resourceId,
  ipAddress,
  userAgent,
  meta,
}) {
  try {
    await query(
      `INSERT INTO audit_logs (
         tenant_id, user_id, action, resource_type, resource_id,
         ip_address, user_agent, meta
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        tenantId ?? null,
        userId ?? null,
        action,
        resourceType || null,
        resourceId != null ? String(resourceId) : null,
        ipAddress || null,
        userAgent ? String(userAgent).slice(0, 500) : null,
        meta ? JSON.stringify(meta) : null,
      ]
    );
  } catch (err) {
    console.warn('[audit] write failed', err.message);
  }
}

export function clientMeta(req) {
  return {
    ipAddress:
      req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      null,
    userAgent: req.headers['user-agent'] || null,
  };
}
