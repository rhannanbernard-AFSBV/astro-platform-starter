import { query, withTransaction } from '../db/client.js';
import { calculateBidLedger } from './biddingMath.js';
import { buildProposalCopy, buildProposalEmailHtml } from './proposalCopy.js';
import { proposalSecureUrl, proposalTokenTtlDays } from './proposalActions.js';
import { getTenantSettings } from './bidService.js';

/**
 * Recompute Decimal ledger from estimator-adjusted sq ft / fixtures and commit pricing.
 */
export async function calibrateBidPricing({
  tenantId,
  bidId,
  userId,
  totalCleanableSqFt,
  detectedFixtures,
  substrateBreakdown,
}) {
  const bidRes = await query(
    `SELECT * FROM bids WHERE tenant_id = $1 AND bid_id = $2`,
    [tenantId, bidId]
  );
  if (!bidRes.rows.length) {
    throw Object.assign(new Error('Bid not found'), { status: 404 });
  }
  const bid = bidRes.rows[0];
  const payload =
    typeof bid.raw_ai_payload === 'string'
      ? JSON.parse(bid.raw_ai_payload)
      : bid.raw_ai_payload || {};

  const sqFt = Number(totalCleanableSqFt);
  if (!Number.isFinite(sqFt) || sqFt <= 0) {
    throw Object.assign(new Error('total_cleanable_sq_ft must be > 0'), {
      status: 400,
      code: 'CALIBRATE_SQFT_REQUIRED',
    });
  }

  const fixtures = Array.isArray(detectedFixtures)
    ? detectedFixtures.map((f) => ({
        fixture_type: String(f.fixture_type || 'fixture').trim() || 'fixture',
        count: Number(f.count) || 0,
        labor_intensity: normalizeIntensity(f.labor_intensity),
      }))
    : payload.spatial_summary?.detected_fixtures || [];

  const substrates = Array.isArray(substrateBreakdown)
    ? substrateBreakdown
    : payload.spatial_summary?.substrate_breakdown || [];

  const ctx = await getTenantSettings(tenantId);
  const mathPart = calculateBidLedger({
    totalCleanableSqFt: sqFt,
    tenantSettings: ctx.tenant,
    jurisdiction: ctx.jurisdiction,
    issaRate: ctx.issaRate,
    primaryCurrency: ctx.primaryCurrency,
    secondaryCurrency: ctx.secondaryCurrency,
    substrateBreakdown: substrates,
    detectedFixtures: fixtures,
  });

  const proposal_copy = buildProposalCopy({
    clientName: bid.client_name,
    propertyAddress: bid.property_address,
    frequency: bid.frequency,
    spatial: mathPart.spatial_summary,
    ledger: mathPart.financial_ledger,
    jurisdictionCode: ctx.tenant.jurisdiction_code,
  });

  const nextPayload = {
    ...payload,
    spatial_summary: {
      ...payload.spatial_summary,
      ...mathPart.spatial_summary,
      measurement_method: 'human_calibrate',
    },
    financial_ledger: mathPart.financial_ledger,
    proposal_copy,
    meta: {
      ...(payload.meta || {}),
      calibration: 'human_calibrate',
      pricing_committed: true,
      calibrated_at: new Date().toISOString(),
    },
  };

  const propRes = await query(
    `SELECT * FROM proposals WHERE bid_id = $1 ORDER BY proposal_id ASC LIMIT 1`,
    [bidId]
  );
  const proposal = propRes.rows[0];

  return withTransaction(async (tx) => {
    const updatedBid = await tx(
      `UPDATE bids SET
         total_sq_ft = $1,
         monthly_price = $2,
         shift_hours = $3,
         raw_ai_payload = $4::jsonb,
         pricing_committed = TRUE,
         calibrated_at = CURRENT_TIMESTAMP,
         calibrated_by = $5
       WHERE tenant_id = $6 AND bid_id = $7
       RETURNING *`,
      [
        mathPart.spatial_summary.total_cleanable_sq_ft,
        mathPart.financial_ledger.recommended_monthly_invoice_price,
        mathPart.financial_ledger.recommended_shift_hours,
        JSON.stringify(nextPayload),
        userId || null,
        tenantId,
        bidId,
      ]
    );

    let updatedProposal = proposal;
    if (proposal) {
      const proposalText = [
        proposal_copy.executive_summary,
        '',
        proposal_copy.detailed_scope_of_work,
      ].join('\n');
      const secureUrl = proposal.access_token
        ? proposalSecureUrl(proposal.access_token)
        : null;
      const emailHtml = secureUrl
        ? buildProposalEmailHtml({
            tenantName: ctx.tenant.name,
            logoUrl: ctx.tenant.logo_url,
            clientName: bid.client_name,
            propertyAddress: bid.property_address,
            totalSqFt: mathPart.spatial_summary.total_cleanable_sq_ft,
            frequency: bid.frequency,
            monthlyPriceFormatted: mathPart.financial_ledger.formatted_monthly,
            secondaryPriceFormatted:
              mathPart.financial_ledger.dual_currency?.formatted_monthly || null,
            proposalSecureUrl: secureUrl,
            companyEmail: ctx.tenant.company_email,
            executiveSummary: proposal_copy.executive_summary,
            detailedScope: proposal_copy.detailed_scope_of_work,
          })
        : proposal.email_html;

      const ttlDays = Math.max(1, proposalTokenTtlDays());
      void ttlDays;
      const upd = await tx(
        `UPDATE proposals SET
           proposal_text = $1,
           email_html = $2
         WHERE proposal_id = $3
         RETURNING *`,
        [proposalText, emailHtml, proposal.proposal_id]
      );
      updatedProposal = upd.rows[0];
    }

    return {
      bid: updatedBid.rows[0],
      proposal: updatedProposal,
      payload: nextPayload,
      spatial_summary: nextPayload.spatial_summary,
      financial_ledger: nextPayload.financial_ledger,
      proposal_copy,
      meta: nextPayload.meta,
      pricing_committed: true,
    };
  });
}

function normalizeIntensity(v) {
  const key = String(v || 'medium').toLowerCase().trim();
  if (key === 'low' || key === 'l') return 'low';
  if (key === 'high' || key === 'h') return 'high';
  return 'medium';
}
