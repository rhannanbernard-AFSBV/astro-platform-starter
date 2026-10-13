import { query } from '../db/client.js';

/**
 * Tenant-scoped admin: currency, margins, SZV burden override, ISSA density, dual-quote.
 * Jurisdiction TOT/consumables editable only for the tenant's jurisdiction (demo admin).
 */
export async function getAdminSettings(tenantId) {
  const tenant = await query(
    `SELECT t.*, s.*
     FROM tenants t
     JOIN tenant_currency_settings s ON s.tenant_id = t.tenant_id
     WHERE t.tenant_id = $1`,
    [tenantId]
  );
  if (!tenant.rows.length) {
    throw Object.assign(new Error('Tenant not found'), { status: 404 });
  }
  const row = tenant.rows[0];

  const juris = await query(
    'SELECT * FROM jurisdiction_tax_settings WHERE jurisdiction_code = $1',
    [row.jurisdiction_code]
  );
  const issa = await query(
    'SELECT density_code, label, sq_ft_per_hour, description FROM issa_production_rates ORDER BY sq_ft_per_hour DESC'
  );
  const currencies = await query(
    'SELECT currency_code, currency_symbol, exchange_rate_to_usd, is_fixed_peg FROM global_exchange_rates ORDER BY currency_code'
  );

  return {
    tenant: {
      tenant_id: row.tenant_id,
      name: row.name,
      jurisdiction_code: row.jurisdiction_code,
      company_email: row.company_email,
      logo_url: row.logo_url,
      insurance_coi_url: row.insurance_coi_url,
      insurance_notes: row.insurance_notes,
      insurance_liability_limit: row.insurance_liability_limit,
    },
    currency: {
      primary_currency_code: row.primary_currency_code,
      secondary_currency_code: row.secondary_currency_code,
      enable_dual_quoting: row.enable_dual_quoting,
      custom_markup_percentage: Number(row.custom_markup_percentage),
    },
    pricing: {
      base_hourly_wage: Number(row.base_hourly_wage),
      target_margin_percentage: Number(row.target_margin_percentage),
      shifts_per_year: Number(row.shifts_per_year),
      facility_density_code: row.facility_density_code,
      labor_burden_override:
        row.labor_burden_override != null
          ? Number(row.labor_burden_override)
          : null,
    },
    jurisdiction: juris.rows[0]
      ? {
          jurisdiction_code: juris.rows[0].jurisdiction_code,
          tot_rate: Number(juris.rows[0].tot_rate),
          labor_burden_multiplier: Number(juris.rows[0].labor_burden_multiplier),
          consumables_rate: Number(juris.rows[0].consumables_rate),
          default_margin_rate: Number(juris.rows[0].default_margin_rate),
          notes: juris.rows[0].notes,
        }
      : null,
    issa_rates: issa.rows.map((r) => ({
      ...r,
      sq_ft_per_hour: Number(r.sq_ft_per_hour),
    })),
    currencies: currencies.rows.map((r) => ({
      ...r,
      exchange_rate_to_usd: Number(r.exchange_rate_to_usd),
    })),
  };
}

/**
 * Tenant admins may update wages / margins / labor_burden_override / currency / COI.
 * Jurisdiction tax table writes require platform admin (is_master).
 */
export async function updateAdminSettings(
  tenantId,
  body,
  { isPlatformAdmin = false } = {}
) {
  const current = await getAdminSettings(tenantId);

  if (body.tenant) {
    const t = body.tenant;
    await query(
      `UPDATE tenants SET
         name = COALESCE($1, name),
         company_email = COALESCE($2, company_email),
         logo_url = COALESCE($3, logo_url),
         insurance_coi_url = COALESCE($4, insurance_coi_url),
         insurance_notes = COALESCE($5, insurance_notes),
         insurance_liability_limit = COALESCE($6, insurance_liability_limit)
       WHERE tenant_id = $7`,
      [
        t.name ?? null,
        t.company_email ?? null,
        t.logo_url ?? null,
        t.insurance_coi_url ?? null,
        t.insurance_notes ?? null,
        t.insurance_liability_limit ?? null,
        tenantId,
      ]
    );
  }

  if (body.currency || body.pricing) {
    const c = body.currency || {};
    const p = body.pricing || {};
    if (c.primary_currency_code) {
      await assertCurrency(c.primary_currency_code);
    }
    if (c.secondary_currency_code) {
      await assertCurrency(c.secondary_currency_code);
    }
    if (p.facility_density_code) {
      const issa = await query(
        'SELECT 1 FROM issa_production_rates WHERE density_code = $1',
        [p.facility_density_code]
      );
      if (!issa.rows.length) {
        throw Object.assign(new Error('Unknown ISSA density_code'), {
          status: 400,
        });
      }
    }
    if (
      p.labor_burden_override != null &&
      (Number(p.labor_burden_override) < 1.0 ||
        Number(p.labor_burden_override) > 1.5)
    ) {
      throw Object.assign(
        new Error('labor_burden_override must be between 1.00 and 1.50 (SZV band)'),
        { status: 400 }
      );
    }

    await query(
      `UPDATE tenant_currency_settings SET
         primary_currency_code = COALESCE($1, primary_currency_code),
         secondary_currency_code = COALESCE($2, secondary_currency_code),
         enable_dual_quoting = COALESCE($3, enable_dual_quoting),
         custom_markup_percentage = COALESCE($4, custom_markup_percentage),
         base_hourly_wage = COALESCE($5, base_hourly_wage),
         target_margin_percentage = COALESCE($6, target_margin_percentage),
         shifts_per_year = COALESCE($7, shifts_per_year),
         facility_density_code = COALESCE($8, facility_density_code),
         labor_burden_override = COALESCE($9, labor_burden_override)
       WHERE tenant_id = $10`,
      [
        c.primary_currency_code ?? null,
        c.secondary_currency_code ?? null,
        c.enable_dual_quoting != null ? Boolean(c.enable_dual_quoting) : null,
        c.custom_markup_percentage != null
          ? Number(c.custom_markup_percentage)
          : null,
        p.base_hourly_wage != null ? Number(p.base_hourly_wage) : null,
        p.target_margin_percentage != null
          ? Number(p.target_margin_percentage)
          : null,
        p.shifts_per_year != null ? Number(p.shifts_per_year) : null,
        p.facility_density_code ?? null,
        p.labor_burden_override != null
          ? Number(p.labor_burden_override)
          : null,
        tenantId,
      ]
    );
  }

  // Global jurisdiction tax table — platform-admin only (prevents cross-tenant TOT mutation)
  if (body.jurisdiction && current.tenant.jurisdiction_code) {
    if (!isPlatformAdmin) {
      throw Object.assign(
        new Error(
          'Jurisdiction tax settings (TOT / default burden / consumables) require platform admin. Use labor_burden_override, wages, and margins on the tenant instead.'
        ),
        { status: 403, code: 'JURISDICTION_WRITE_FORBIDDEN' }
      );
    }
    const j = body.jurisdiction;
    await query(
      `UPDATE jurisdiction_tax_settings SET
         tot_rate = COALESCE($1, tot_rate),
         labor_burden_multiplier = COALESCE($2, labor_burden_multiplier),
         consumables_rate = COALESCE($3, consumables_rate),
         default_margin_rate = COALESCE($4, default_margin_rate),
         updated_at = CURRENT_TIMESTAMP
       WHERE jurisdiction_code = $5`,
      [
        j.tot_rate != null ? Number(j.tot_rate) : null,
        j.labor_burden_multiplier != null
          ? Number(j.labor_burden_multiplier)
          : null,
        j.consumables_rate != null ? Number(j.consumables_rate) : null,
        j.default_margin_rate != null ? Number(j.default_margin_rate) : null,
        current.tenant.jurisdiction_code,
      ]
    );
  }

  return getAdminSettings(tenantId);
}

async function assertCurrency(code) {
  const { rows } = await query(
    'SELECT 1 FROM global_exchange_rates WHERE currency_code = $1',
    [code]
  );
  if (!rows.length) {
    throw Object.assign(new Error(`Unknown currency ${code}`), { status: 400 });
  }
}
