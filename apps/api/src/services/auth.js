import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db/client.js';
import { resolveJwtSecret } from './jwtSecret.js';

const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
let _jwtSecret = null;

export function getJwtSecret() {
  if (!_jwtSecret) {
    _jwtSecret = resolveJwtSecret();
  }
  return _jwtSecret;
}

export async function registerUser({
  email,
  password,
  fullName,
  tenantId,
  createTenantName,
}) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized || !password || String(password).length < 8) {
    throw Object.assign(
      new Error('email and password (min 8 chars) are required'),
      { status: 400 }
    );
  }
  if (!fullName?.trim()) {
    throw Object.assign(new Error('full_name is required'), { status: 400 });
  }

  let resolvedTenantId = tenantId ? Number(tenantId) : null;

  if (!resolvedTenantId && createTenantName) {
    const t = await query(
      `INSERT INTO tenants (name, jurisdiction_code, company_email)
       VALUES ($1, 'SXM', $2)
       RETURNING tenant_id`,
      [createTenantName.trim(), normalized]
    );
    resolvedTenantId = t.rows[0].tenant_id;
    await query(
      `INSERT INTO tenant_currency_settings (
        tenant_id, primary_currency_code, enable_dual_quoting, secondary_currency_code,
        custom_markup_percentage, base_hourly_wage, target_margin_percentage,
        shifts_per_year, facility_density_code
      ) VALUES ($1, 'USD', TRUE, 'XCG', 0.00, 18.00, 30.00, 260, 'office_low')
      ON CONFLICT (tenant_id) DO NOTHING`,
      [resolvedTenantId]
    );
  }

  if (!resolvedTenantId) {
    resolvedTenantId = Number(process.env.DEFAULT_TENANT_ID || 1);
  }

  const tenant = await query(
    'SELECT tenant_id, name FROM tenants WHERE tenant_id = $1',
    [resolvedTenantId]
  );
  if (!tenant.rows.length) {
    throw Object.assign(new Error('Tenant not found'), { status: 404 });
  }

  const existing = await query(
    'SELECT user_id FROM users WHERE tenant_id = $1 AND email = $2',
    [resolvedTenantId, normalized]
  );
  if (existing.rows.length) {
    throw Object.assign(new Error('Email already registered for this tenant'), {
      status: 409,
    });
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const ins = await query(
    `INSERT INTO users (tenant_id, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, 'member')
     RETURNING user_id, tenant_id, email, full_name, role, created_at`,
    [resolvedTenantId, normalized, passwordHash, fullName.trim()]
  );
  const user = ins.rows[0];
  const token = signToken(user);
  return { user: publicUser(user), token, tenant: tenant.rows[0] };
}

export async function loginUser({ email, password, tenantId }) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized || !password) {
    throw Object.assign(new Error('email and password are required'), {
      status: 400,
    });
  }

  let rows;
  if (tenantId) {
    const r = await query(
      `SELECT u.*, t.name AS tenant_name
       FROM users u JOIN tenants t ON t.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.email = $2`,
      [Number(tenantId), normalized]
    );
    rows = r.rows;
  } else {
    const r = await query(
      `SELECT u.*, t.name AS tenant_name
       FROM users u JOIN tenants t ON t.tenant_id = u.tenant_id
       WHERE u.email = $1
       ORDER BY u.user_id ASC
       LIMIT 2`,
      [normalized]
    );
    rows = r.rows;
    if (rows.length > 1) {
      throw Object.assign(
        new Error('Multiple tenants for this email — pass tenant_id'),
        { status: 400 }
      );
    }
  }

  if (!rows.length) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const user = rows[0];
  const ok = await bcrypt.compare(String(password), user.password_hash);
  if (!ok) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const tokenUser = {
    ...user,
    home_tenant_id: user.tenant_id,
  };

  return {
    user: publicUser(tokenUser),
    token: signToken(tokenUser),
    tenant: { tenant_id: user.tenant_id, name: user.tenant_name },
  };
}

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.user_id,
      tenant_id: user.tenant_id,
      email: user.email,
      role: user.role,
      is_master: Boolean(user.is_master),
      home_tenant_id: user.home_tenant_id ?? user.tenant_id,
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}

function publicUser(user) {
  return {
    user_id: user.user_id,
    tenant_id: user.tenant_id,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    is_master: Boolean(user.is_master),
    home_tenant_id: user.home_tenant_id ?? user.tenant_id,
  };
}

/** Seed demo user if missing (password: demo1234) */
export async function ensureDemoUser() {
  const email = 'demo@omniclean.demo';
  const existing = await query(
    'SELECT user_id FROM users WHERE tenant_id = 1 AND email = $1',
    [email]
  );
  if (!existing.rows.length) {
    const hash = await bcrypt.hash('demo1234', 10);
    await query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role, is_master)
       VALUES (1, $1, $2, 'Demo Estimator', 'admin', TRUE)`,
      [email, hash]
    );
    console.log('[seed] demo user demo@omniclean.demo / demo1234 (tenant 1)');
  } else {
    await query(
      `UPDATE users SET is_master = TRUE WHERE user_id = $1`,
      [existing.rows[0].user_id]
    );
  }
}

export function newAccessToken() {
  return crypto.randomBytes(24).toString('hex');
}
