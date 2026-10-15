import { query, withTransaction } from '../db/client.js';
import { newAccessToken } from './auth.js';
import { calculateBidLedger } from './biddingMath.js';
import { buildCrewChecklist } from './checklist.js';
import { buildProposalCopy, buildProposalEmailHtml } from './proposalCopy.js';
import {
  proposalSecureUrl,
  proposalTokenTtlDays,
} from './proposalActions.js';
import {
  processWalkthroughMedia,
  mockSpatialExtraction,
} from './visionExtract.js';
import { notifyNewChecklist } from './pushNotify.js';

async function loadTenantContext(tenantId) {
  const tenantRes = await query(
    `SELECT t.tenant_id, t.name, t.jurisdiction_code, t.logo_url, t.company_email,
            t.insurance_coi_url, t.insurance_notes, t.insurance_liability_limit,
            s.primary_currency_code, s.enable_dual_quoting, s.secondary_currency_code,
            s.custom_markup_percentage, s.base_hourly_wage, s.target_margin_percentage,
            s.shifts_per_year, s.facility_density_code, s.labor_burden_override
     FROM tenants t
     JOIN tenant_currency_settings s ON s.tenant_id = t.tenant_id
     WHERE t.tenant_id = $1`,
    [tenantId]
  );
  if (!tenantRes.rows.length) {
    throw Object.assign(new Error(`Tenant ${tenantId} not found`), { status: 404 });
  }
  const row = tenantRes.rows[0];

  const juris = await query(
    `SELECT * FROM jurisdiction_tax_settings WHERE jurisdiction_code = $1`,
    [row.jurisdiction_code]
  );
  if (!juris.rows.length) {
    throw Object.assign(
      new Error(`Jurisdiction ${row.jurisdiction_code} not configured`),
      { status: 500 }
    );
  }
  // Tenant SZV burden override (admin) wins over jurisdiction default when set
  if (row.labor_burden_override != null) {
    juris.rows[0] = {
      ...juris.rows[0],
      labor_burden_multiplier: row.labor_burden_override,
    };
  }

  const issa = await query(
    `SELECT * FROM issa_production_rates WHERE density_code = $1`,
    [row.facility_density_code]
  );
  if (!issa.rows.length) {
    throw Object.assign(
      new Error(`ISSA density ${row.facility_density_code} not found`),
      { status: 500 }
    );
  }

  const primary = await query(
    `SELECT * FROM global_exchange_rates WHERE currency_code = $1`,
    [row.primary_currency_code]
  );
  let secondary = { rows: [] };
  if (row.enable_dual_quoting && row.secondary_currency_code) {
    secondary = await query(
      `SELECT * FROM global_exchange_rates WHERE currency_code = $1`,
      [row.secondary_currency_code]
    );
  }

  return {
    tenant: row,
    jurisdiction: juris.rows[0],
    issaRate: issa.rows[0],
    primaryCurrency: primary.rows[0],
    secondaryCurrency: secondary.rows[0] || null,
  };
}

/**
 * Full demo path: spatial extract → Decimal bid math → persist bid/checklist/proposal.
 * Multi-frame: pass `frames` (image buffers). Optional `videoMeta` for coverage notes.
 * When commitPricing=false, provisional ledger is stored but pricing_committed stays false
 * until POST /api/bids/:id/calibrate.
 */
export async function createBidFromWalkthrough({
  tenantId,
  clientName,
  propertyAddress,
  frequency = '5x / week',
  imageBuffer,
  mimeType,
  frames,
  videoMeta = null,
  hintSqFt,
  useMock = false,
  commitPricing = true,
}) {
  const ctx = await loadTenantContext(tenantId);
  const frameList =
    Array.isArray(frames) && frames.length
      ? frames
      : imageBuffer?.length
        ? [{ buffer: imageBuffer, mimeType: mimeType || 'image/jpeg' }]
        : [];

  const modifiers = {
    client_name: clientName,
    property_address: propertyAddress,
    frequency,
    jurisdiction: ctx.tenant.jurisdiction_code,
    hint_sq_ft: hintSqFt,
    facility_profile: ctx.tenant.facility_density_code,
    frame_count: Math.max(1, frameList.length || 1),
    video_received: Boolean(videoMeta),
  };

  let extraction;
  if (useMock || !frameList.length) {
    extraction = mockSpatialExtraction(modifiers);
  } else {
    extraction = await processWalkthroughMedia(frameList, modifiers);
  }

  const mathPart = calculateBidLedger({
    totalCleanableSqFt: extraction.spatial_summary.total_cleanable_sq_ft,
    tenantSettings: ctx.tenant,
    jurisdiction: ctx.jurisdiction,
    issaRate: ctx.issaRate,
    primaryCurrency: ctx.primaryCurrency,
    secondaryCurrency: ctx.secondaryCurrency,
    substrateBreakdown: extraction.spatial_summary.substrate_breakdown,
    detectedFixtures: extraction.spatial_summary.detected_fixtures,
  });

  const crew_checklist = buildCrewChecklist(extraction.room_zones);
  const proposal_copy = buildProposalCopy({
    clientName,
    propertyAddress,
    frequency,
    spatial: mathPart.spatial_summary,
    ledger: mathPart.financial_ledger,
    jurisdictionCode: ctx.tenant.jurisdiction_code,
  });

  const payload = {
    spatial_summary: {
      ...mathPart.spatial_summary,
      excluded_structural_sq_ft:
        extraction.spatial_summary.excluded_structural_sq_ft,
      measurement_method: extraction.spatial_summary.measurement_method,
    },
    scale_and_legend: extraction.scale_and_legend || null,
    financial_ledger: mathPart.financial_ledger,
    proposal_copy,
    crew_checklist,
    meta: {
      extraction_source: extraction._source,
      property_notes: extraction.property_notes,
      jurisdiction_code: ctx.tenant.jurisdiction_code,
      scale_calibration: extraction._scale_calibration,
      frame_count: extraction._frame_count || frameList.length || 1,
      video_received: Boolean(videoMeta || extraction._video_received),
      video: videoMeta || null,
      pricing_committed: Boolean(commitPricing),
    },
  };

  const saved = await saveAIBidToDatabase({
    tenantId,
    clientName,
    propertyAddress,
    frequency,
    aiResponse: payload,
    tenant: ctx.tenant,
    pricingCommitted: Boolean(commitPricing),
  });

  try {
    await notifyNewChecklist(tenantId, saved.bid.bid_id, crew_checklist.length);
  } catch (err) {
    console.warn('[push] checklist notify failed', err.message);
  }

  return { ...saved, payload, pricing_committed: Boolean(commitPricing) };
}

/**
 * Transaction: Bids → Proposals → batch Bid_Checklists
 */
export async function saveAIBidToDatabase({
  tenantId,
  clientName,
  propertyAddress,
  frequency,
  aiResponse,
  tenant,
  pricingCommitted = true,
}) {
  const ledger = aiResponse.financial_ledger;
  const spatial = aiResponse.spatial_summary;

  return withTransaction(async (tx) => {
    const bidIns = await tx(
      `INSERT INTO bids (
         tenant_id, client_name, property_address, frequency,
         total_sq_ft, monthly_price, shift_hours, raw_ai_payload,
         pricing_committed, calibrated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,
         CASE WHEN $9 THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING *`,
      [
        tenantId,
        clientName,
        propertyAddress || null,
        frequency,
        spatial.total_cleanable_sq_ft,
        ledger.recommended_monthly_invoice_price,
        ledger.recommended_shift_hours,
        JSON.stringify(aiResponse),
        Boolean(pricingCommitted),
      ]
    );
    const bid = bidIns.rows[0];

    const proposalText = [
      aiResponse.proposal_copy.executive_summary,
      '',
      aiResponse.proposal_copy.detailed_scope_of_work,
    ].join('\n');

    const accessToken = newAccessToken();
    const secureUrl = proposalSecureUrl(accessToken);
    const emailHtml = buildProposalEmailHtml({
      tenantName: tenant.name,
      logoUrl: tenant.logo_url,
      clientName,
      propertyAddress,
      totalSqFt: spatial.total_cleanable_sq_ft,
      frequency,
      monthlyPriceFormatted: ledger.formatted_monthly,
      secondaryPriceFormatted: ledger.dual_currency?.formatted_monthly || null,
      proposalSecureUrl: secureUrl,
      companyEmail: tenant.company_email,
      executiveSummary: aiResponse.proposal_copy.executive_summary,
      detailedScope: aiResponse.proposal_copy.detailed_scope_of_work,
    });

    const ttlDays = Math.max(1, proposalTokenTtlDays());
    const propIns = await tx(
      `INSERT INTO proposals (
         tenant_id, bid_id, status, proposal_text, email_html, access_token,
         access_token_created_at, access_token_expires_at
       ) VALUES (
         $1, $2, 'Draft', $3, $4, $5,
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '${ttlDays} days'
       )
       RETURNING *`,
      [tenantId, bid.bid_id, proposalText, emailHtml, accessToken]
    );

    const checklists = [];
    for (const item of aiResponse.crew_checklist || []) {
      const c = await tx(
        `INSERT INTO bid_checklists (
           tenant_id, bid_id, room_zone, tasks, is_high_risk, ai_audit_prompt
         ) VALUES ($1, $2, $3, $4::text[], $5, $6)
         RETURNING *`,
        [
          tenantId,
          bid.bid_id,
          item.room_zone,
          item.tasks,
          Boolean(item.is_high_risk),
          item.ai_audit_prompt || null,
        ]
      );
      checklists.push(c.rows[0]);
    }

    return {
      bid: bidIns.rows[0],
      proposal: propIns.rows[0],
      checklists,
    };
  });
}

export async function listBids(tenantId) {
  const { rows } = await query(
    `SELECT bid_id, tenant_id, client_name, property_address, frequency,
            total_sq_ft, monthly_price, shift_hours, created_at
     FROM bids WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [tenantId]
  );
  return rows;
}

export async function getBid(tenantId, bidId) {
  const { rows } = await query(
    `SELECT * FROM bids WHERE tenant_id = $1 AND bid_id = $2`,
    [tenantId, bidId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Bid not found'), { status: 404 });
  }
  const bid = rows[0];
  const checklists = await query(
    `SELECT * FROM bid_checklists WHERE tenant_id = $1 AND bid_id = $2 ORDER BY checklist_id`,
    [tenantId, bidId]
  );
  const proposals = await query(
    `SELECT * FROM proposals WHERE tenant_id = $1 AND bid_id = $2 ORDER BY proposal_id`,
    [tenantId, bidId]
  );
  return {
    bid,
    checklists: checklists.rows,
    proposals: proposals.rows,
    payload: bid.raw_ai_payload,
  };
}

export async function getTenantSettings(tenantId) {
  return loadTenantContext(tenantId);
}
