import { Router } from 'express';
import { loginUser, registerUser } from '../services/auth.js';
import { requireAuth, rlsBypass } from '../middleware/auth.js';
import { query } from '../db/client.js';
import {
  listAccessibleTenants,
  switchTenantContext,
} from '../services/masterTenant.js';
import { clientMeta, writeAuditLog } from '../services/auditLog.js';

const router = Router();

// Login/register look up users across tenants — bypass RLS for these routes
router.use(rlsBypass);

router.post('/register', async (req, res, next) => {
  try {
    const result = await registerUser({
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.full_name,
      tenantId: req.body.tenant_id,
      createTenantName: req.body.company_name,
      inviteCode: req.body.invite_code,
    });
    const meta = clientMeta(req);
    await writeAuditLog({
      tenantId: result.user.tenant_id,
      userId: result.user.user_id,
      action: 'auth.register',
      resourceType: 'user',
      resourceId: result.user.user_id,
      ...meta,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const result = await loginUser({
      email: req.body.email,
      password: req.body.password,
      tenantId: req.body.tenant_id,
    });
    const meta = clientMeta(req);
    await writeAuditLog({
      tenantId: result.user.tenant_id,
      userId: result.user.user_id,
      action: 'auth.login',
      resourceType: 'user',
      resourceId: result.user.user_id,
      ...meta,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.user_id, u.email, u.full_name, u.role, u.is_master, u.tenant_id AS home_tenant_id
       FROM users u WHERE u.user_id = $1`,
      [req.user.user_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const u = rows[0];
    const tenant = await query(
      `SELECT tenant_id, name, jurisdiction_code, is_master, master_tenant_id
       FROM tenants WHERE tenant_id = $1`,
      [req.tenantId]
    );
    if (!tenant.rows.length) {
      return res.status(404).json({ error: 'Active tenant not found' });
    }
    res.json({
      user: {
        user_id: u.user_id,
        tenant_id: req.tenantId,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        is_master: Boolean(u.is_master),
        home_tenant_id: u.home_tenant_id,
      },
      tenant: tenant.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/tenants', requireAuth, async (req, res, next) => {
  try {
    const result = await listAccessibleTenants(req.user.user_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/switch-tenant', requireAuth, async (req, res, next) => {
  try {
    const tenantId = Number(req.body.tenant_id);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_id is required' });
    }
    const result = await switchTenantContext(req.user.user_id, tenantId);
    const meta = clientMeta(req);
    await writeAuditLog({
      tenantId,
      userId: req.user.user_id,
      action: 'auth.switch_tenant',
      resourceType: 'tenant',
      resourceId: tenantId,
      ...meta,
      meta: { from_tenant_id: req.user.tenant_id },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
