import { query } from '../db/client.js';
import { allowDemoSeed, withRlsBypass } from '../db/tenantContext.js';
import { signToken } from './auth.js';

/**
 * Master firm can securely switch among sub-tenant business profiles.
 * Access: user.is_master OR row in master_tenant_access OR tenant under same master.
 */

export async function ensureDemoMasterGraph() {
  if (!allowDemoSeed()) {
    console.log(
      '[seed] skipping demo master graph (production — set ALLOW_DEMO_SEED=true to override)'
    );
    return;
  }

  return withRlsBypass(async () => {
    // Link demo user as master with access to tenants 1 and 2
    const demo = await query(
      `SELECT user_id FROM users WHERE email = 'demo@omniclean.demo' LIMIT 1`
    );
    if (!demo.rows.length) return;
    const userId = demo.rows[0].user_id;
    await query(`UPDATE users SET is_master = TRUE WHERE user_id = $1`, [userId]);

    for (const tid of [1, 2, 100]) {
      const t = await query('SELECT tenant_id FROM tenants WHERE tenant_id = $1', [
        tid,
      ]);
      if (!t.rows.length) continue;
      await query(
        `INSERT INTO master_tenant_access (user_id, tenant_id)
         VALUES ($1, $2) ON CONFLICT (user_id, tenant_id) DO NOTHING`,
        [userId, tid]
      );
    }

    // Ensure tenant 2 currency settings exist
    const s2 = await query(
      'SELECT 1 FROM tenant_currency_settings WHERE tenant_id = 2'
    );
    if (!s2.rows.length) {
      await query(
        `INSERT INTO tenant_currency_settings (
          tenant_id, primary_currency_code, enable_dual_quoting, secondary_currency_code,
          custom_markup_percentage, base_hourly_wage, target_margin_percentage,
          shifts_per_year, facility_density_code
        ) VALUES (2, 'USD', TRUE, 'XCG', 0.00, 17.00, 28.00, 260, 'retail')`
      );
    }
  });
}

export async function listAccessibleTenants(userId) {
  const user = await query(
    `SELECT user_id, tenant_id, is_master, email, full_name, role FROM users WHERE user_id = $1`,
    [userId]
  );
  if (!user.rows.length) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }
  const u = user.rows[0];

  if (u.is_master) {
    const { rows } = await query(
      `SELECT t.tenant_id, t.name, t.jurisdiction_code, t.is_master, t.master_tenant_id
       FROM tenants t
       WHERE t.tenant_id IN (
         SELECT tenant_id FROM master_tenant_access WHERE user_id = $1
         UNION SELECT $2
         UNION SELECT tenant_id FROM tenants WHERE master_tenant_id IN (
           SELECT tenant_id FROM tenants WHERE is_master = TRUE AND tenant_id IN (
             SELECT tenant_id FROM master_tenant_access WHERE user_id = $1
           )
         )
       )
       ORDER BY t.is_master DESC, t.tenant_id ASC`,
      [userId, u.tenant_id]
    );
    return { user: publicUser(u), tenants: rows };
  }

  const { rows } = await query(
    `SELECT tenant_id, name, jurisdiction_code, is_master, master_tenant_id
     FROM tenants WHERE tenant_id = $1`,
    [u.tenant_id]
  );
  return { user: publicUser(u), tenants: rows };
}

export async function switchTenantContext(userId, targetTenantId) {
  const access = await listAccessibleTenants(userId);
  const allowed = access.tenants.some(
    (t) => Number(t.tenant_id) === Number(targetTenantId)
  );
  if (!allowed) {
    throw Object.assign(
      new Error('Not authorized to switch into this tenant'),
      { status: 403 }
    );
  }

  const userRow = await query(
    `SELECT user_id, email, full_name, role, is_master, tenant_id AS home_tenant_id
     FROM users WHERE user_id = $1`,
    [userId]
  );
  const u = userRow.rows[0];
  const token = signToken({
    user_id: u.user_id,
    tenant_id: Number(targetTenantId),
    email: u.email,
    role: u.role,
    is_master: Boolean(u.is_master),
    home_tenant_id: u.home_tenant_id,
  });

  const tenant = access.tenants.find(
    (t) => Number(t.tenant_id) === Number(targetTenantId)
  );

  return {
    token,
    user: {
      user_id: u.user_id,
      tenant_id: Number(targetTenantId),
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      is_master: Boolean(u.is_master),
      home_tenant_id: u.home_tenant_id,
    },
    tenant,
  };
}

function publicUser(u) {
  return {
    user_id: u.user_id,
    tenant_id: u.tenant_id,
    email: u.email,
    full_name: u.full_name,
    role: u.role,
    is_master: Boolean(u.is_master),
  };
}
