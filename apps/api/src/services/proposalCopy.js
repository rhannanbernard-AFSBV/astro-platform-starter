import { formatMoney } from './biddingMath.js';

/**
 * Generate proposal narrative from spatial + ledger (no LLM math).
 */
export function buildProposalCopy({
  clientName,
  propertyAddress,
  frequency,
  spatial,
  ledger,
  jurisdictionCode,
}) {
  const fixtures = (spatial.detected_fixtures || [])
    .map((f) => `${f.count}× ${f.fixture_type}`)
    .join(', ');
  const substrates = (spatial.substrate_breakdown || [])
    .map((s) => `${s.material} (${s.percentage}%)`)
    .join(', ');

  const monthly = ledger.formatted_monthly;
  const hours = ledger.recommended_shift_hours;
  const dual = ledger.dual_currency
    ? ` Dual-quote secondary: ${ledger.dual_currency.formatted_monthly} (${ledger.dual_currency.conversion_note}).`
    : '';

  const executive_summary = `${clientName} — commercial cleaning proposal for ${propertyAddress || 'the subject property'} covering approximately ${spatial.total_cleanable_sq_ft.toLocaleString()} cleanable sq ft at ${frequency}. Recommended service investment: ${monthly}/month (${hours} hrs/shift, jurisdiction ${jurisdictionCode}).${dual}`;

  const detailed_scope_of_work = [
    `Scope includes floor care across: ${substrates || 'mixed substrates'}.`,
    fixtures ? `High-touch / fixture care includes: ${fixtures}.` : '',
    `Crew follows a sequenced room checklist with AI audit prompts on high-risk zones (restrooms, medical, kitchens).`,
    `Pricing uses ISSA production rates, tenant labor burden, ${Number(ledger.consumables_rate) * 100}% consumables, target margin, and local turnover tax (${Number(ledger.tot_rate) * 100}% TOT) — all computed in deterministic backend arithmetic.`,
    `Per-shift charged price: ${ledger.formatted_per_shift}; monthly flat invoice: ${monthly}.`,
  ]
    .filter(Boolean)
    .join(' ');

  return { executive_summary, detailed_scope_of_work };
}

/**
 * Localized proposal email HTML.
 */
export function buildProposalEmailHtml({
  tenantName,
  logoUrl,
  clientName,
  propertyAddress,
  totalSqFt,
  frequency,
  monthlyPriceFormatted,
  secondaryPriceFormatted,
  proposalSecureUrl,
  companyEmail,
  executiveSummary,
  detailedScope,
}) {
  const dualLine = secondaryPriceFormatted
    ? `<p style="margin:0 0 8px;color:#334155;"><strong>Secondary quote:</strong> ${secondaryPriceFormatted}</p>`
    : '';
  const logo = logoUrl
    ? `<img src="${logoUrl}" alt="${tenantName}" height="40" style="max-height:40px;" />`
    : `<strong style="font-size:20px;color:#0f766e;">${tenantName || 'OmniClean'}</strong>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>Cleaning Proposal</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Georgia,'Times New Roman',serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:4px;overflow:hidden;">
        <tr><td style="padding:28px 32px;border-bottom:3px solid #0f766e;">${logo}</td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 4px;color:#64748b;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;">Commercial cleaning proposal</p>
          <h1 style="margin:0 0 16px;font-size:26px;font-weight:normal;">Prepared for ${escapeHtml(clientName)}</h1>
          <p style="margin:0 0 8px;"><strong>Property:</strong> ${escapeHtml(propertyAddress || '—')}</p>
          <p style="margin:0 0 8px;"><strong>Cleanable area:</strong> ${Number(totalSqFt).toLocaleString()} sq ft</p>
          <p style="margin:0 0 8px;"><strong>Frequency:</strong> ${escapeHtml(frequency || '—')}</p>
          <p style="margin:0 0 8px;"><strong>Monthly investment:</strong> <span style="font-size:22px;color:#0f766e;">${escapeHtml(monthlyPriceFormatted)}</span></p>
          ${dualLine}
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="margin:0 0 12px;line-height:1.5;">${escapeHtml(executiveSummary)}</p>
          <p style="margin:0 0 24px;line-height:1.5;color:#334155;">${escapeHtml(detailedScope)}</p>
          <p style="margin:0;">
            <a href="${escapeHtml(proposalSecureUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:2px;">
              Review &amp; accept proposal
            </a>
          </p>
        </td></tr>
        <tr><td style="padding:20px 32px;background:#0f172a;color:#94a3b8;font-size:12px;font-family:system-ui,sans-serif;">
          Sent by ${escapeHtml(tenantName || 'OmniClean')} · ${escapeHtml(companyEmail || '')}<br/>
          Powered by OmniClean AI Scanner
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { formatMoney };
