import { query } from '../db/client.js';

/**
 * Bid history + analytics (tenant-scoped).
 * outcome: open | sent | accepted | won | lost | withdrawn
 * Signed portal → accepted (not won). Won is an explicit sales close.
 */

const OUTCOMES = ['open', 'sent', 'accepted', 'won', 'lost', 'withdrawn'];

const LOSS_REASONS = [
  'price',
  'competitor',
  'scope',
  'timing',
  'no_response',
  'incumbent',
  'other',
];

export async function listBidHistory(tenantId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT b.bid_id, b.tenant_id, b.client_name, b.property_address, b.frequency,
            b.total_sq_ft, b.monthly_price, b.shift_hours, b.outcome,
            b.outcome_at, b.won_monthly_revenue, b.loss_reason, b.loss_notes,
            b.competitor_price, b.created_at,
            (SELECT status FROM proposals WHERE bid_id = b.bid_id ORDER BY proposal_id ASC LIMIT 1) AS proposal_status,
            (SELECT signed_at FROM proposals WHERE bid_id = b.bid_id ORDER BY proposal_id ASC LIMIT 1) AS signed_at,
            (SELECT sent_at FROM proposals WHERE bid_id = b.bid_id ORDER BY proposal_id ASC LIMIT 1) AS sent_at
     FROM bids b
     WHERE b.tenant_id = $1
     ORDER BY b.created_at DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, Math.min(Number(limit) || 50, 200), Number(offset) || 0]
  );
  return rows;
}

export async function setBidOutcome(
  tenantId,
  bidId,
  outcome,
  { lossReason, lossNotes, competitorPrice } = {}
) {
  if (!OUTCOMES.includes(outcome)) {
    throw Object.assign(
      new Error(`outcome must be one of ${OUTCOMES.join(', ')}`),
      { status: 400 }
    );
  }
  if (outcome === 'lost') {
    if (lossReason && !LOSS_REASONS.includes(lossReason)) {
      throw Object.assign(
        new Error(`loss_reason must be one of ${LOSS_REASONS.join(', ')}`),
        { status: 400 }
      );
    }
  }
  const bid = await query(
    'SELECT bid_id, monthly_price FROM bids WHERE bid_id = $1 AND tenant_id = $2',
    [bidId, tenantId]
  );
  if (!bid.rows.length) {
    throw Object.assign(new Error('Bid not found'), { status: 404 });
  }
  const wonRev =
    outcome === 'won' ? Number(bid.rows[0].monthly_price) : null;
  const { rows } = await query(
    `UPDATE bids SET
       outcome = $1,
       outcome_at = CURRENT_TIMESTAMP,
       won_monthly_revenue = $2,
       loss_reason = $3,
       loss_notes = $4,
       competitor_price = $5
     WHERE bid_id = $6 AND tenant_id = $7
     RETURNING *`,
    [
      outcome,
      wonRev,
      outcome === 'lost' ? lossReason || null : null,
      outcome === 'lost' ? lossNotes || null : null,
      outcome === 'lost' && competitorPrice != null
        ? Number(competitorPrice)
        : null,
      bidId,
      tenantId,
    ]
  );
  return rows[0];
}

export async function getAnalytics(tenantId) {
  const totals = await query(
    `SELECT
       COUNT(*)::int AS total_bids,
       COUNT(*) FILTER (WHERE outcome = 'won')::int AS won,
       COUNT(*) FILTER (WHERE outcome = 'accepted')::int AS accepted,
       COUNT(*) FILTER (WHERE outcome = 'lost')::int AS lost,
       COUNT(*) FILTER (WHERE outcome IN ('open','sent','accepted'))::int AS open_pipeline,
       COALESCE(SUM(CASE WHEN outcome = 'won' THEN won_monthly_revenue ELSE 0 END), 0) AS won_monthly_recurring
     FROM bids WHERE tenant_id = $1`,
    [tenantId]
  );
  const t = totals.rows[0];
  const decided = Number(t.won) + Number(t.lost);
  const winRate = decided > 0 ? Number(t.won) / decided : null;

  const lossBreakdown = await query(
    `SELECT loss_reason, COUNT(*)::int AS count
     FROM bids
     WHERE tenant_id = $1 AND outcome = 'lost' AND loss_reason IS NOT NULL
     GROUP BY loss_reason
     ORDER BY count DESC`,
    [tenantId]
  );

  const recent = await query(
    `SELECT bid_id, outcome, won_monthly_revenue, created_at, outcome_at
     FROM bids WHERE tenant_id = $1
     ORDER BY created_at DESC
     LIMIT 500`,
    [tenantId]
  );

  const byMonthMap = new Map();
  const cutoff = Date.now() - 365 * 24 * 3600 * 1000;
  for (const row of recent.rows) {
    const d = new Date(row.outcome_at || row.created_at);
    if (d.getTime() < cutoff) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (!byMonthMap.has(key)) {
      byMonthMap.set(key, { month: key, wins: 0, revenue: 0, bids_created: 0 });
    }
    const bucket = byMonthMap.get(key);
    bucket.bids_created += 1;
    if (row.outcome === 'won') {
      bucket.wins += 1;
      bucket.revenue += Number(row.won_monthly_revenue || 0);
    }
  }

  return {
    tenant_id: tenantId,
    totals: {
      total_bids: Number(t.total_bids),
      won: Number(t.won),
      accepted: Number(t.accepted),
      lost: Number(t.lost),
      open_pipeline: Number(t.open_pipeline),
      win_rate: winRate != null ? Math.round(winRate * 1000) / 1000 : null,
      won_monthly_recurring: Number(t.won_monthly_recurring),
    },
    loss_reasons: lossBreakdown.rows,
    revenue_by_month: [...byMonthMap.values()].sort((a, b) =>
      a.month.localeCompare(b.month)
    ),
    loss_reason_options: LOSS_REASONS,
  };
}

/** Sync outcome from proposal status when sent/signed */
export async function syncOutcomeFromProposal(tenantId, bidId, proposalStatus) {
  if (proposalStatus === 'Signed') {
    // Accepted (e-sign) ≠ won (closed contract) — keep analytics honest
    return setBidOutcome(tenantId, bidId, 'accepted');
  }
  if (proposalStatus === 'Sent') {
    const cur = await query(
      'SELECT outcome FROM bids WHERE bid_id = $1 AND tenant_id = $2',
      [bidId, tenantId]
    );
    const o = cur.rows[0]?.outcome;
    if (o === 'open' || !o) {
      return setBidOutcome(tenantId, bidId, 'sent');
    }
  }
  return null;
}
