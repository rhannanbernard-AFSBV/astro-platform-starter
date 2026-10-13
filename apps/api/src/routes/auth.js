import { Router } from 'express';
import { loginUser, registerUser } from '../services/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../db/client.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const result = await registerUser({
      email: req.body.email,
      password: req.body.password,
      fullName: req.body.full_name,
      tenantId: req.body.tenant_id,
      createTenantName: req.body.company_name,
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
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.user_id, u.tenant_id, u.email, u.full_name, u.role,
              t.name AS tenant_name, t.jurisdiction_code
       FROM users u
       JOIN tenants t ON t.tenant_id = u.tenant_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [req.user.user_id, req.user.tenant_id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }
    const u = rows[0];
    res.json({
      user: {
        user_id: u.user_id,
        tenant_id: u.tenant_id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
      },
      tenant: {
        tenant_id: u.tenant_id,
        name: u.tenant_name,
        jurisdiction_code: u.jurisdiction_code,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
