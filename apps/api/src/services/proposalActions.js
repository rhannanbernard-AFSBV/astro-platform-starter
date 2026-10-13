import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db/client.js';
import { newAccessToken } from './auth.js';
import { sendEmail, emailTransportName } from './email.js';
import { buildProposalEmailHtml } from './proposalCopy.js';
import { syncOutcomeFromProposal } from './analytics.js';
import { signedAbsoluteUrl } from './signedUrls.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const signaturesDir = path.resolve(__dirname, '../../data/signatures');

export function publicBaseUrl() {
  return (
    process.env.PUBLIC_APP_URL?.replace(/\/$/, '') ||
    `http://localhost:${process.env.PORT || 4000}`
  );
}

export function proposalSecureUrl(accessToken) {
  return `${publicBaseUrl()}/p/${accessToken}`;
}

export function proposalTokenTtlDays() {
  return Number(process.env.PROPOSAL_TOKEN_TTL_DAYS || 30);
}

function tokenExpirySql() {
  const days = Math.max(1, proposalTokenTtlDays());
  return `CURRENT_TIMESTAMP + INTERVAL '${days} days'`;
}

export async function ensureProposalToken(proposalId) {
  const { rows } = await query(
    `SELECT proposal_id, access_token, access_token_expires_at
     FROM proposals WHERE proposal_id = $1`,
    [proposalId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Proposal not found'), { status: 404 });
  }
  const row = rows[0];
  const expired =
    row.access_token_expires_at &&
    new Date(row.access_token_expires_at).getTime() < Date.now();
  if (row.access_token && !expired) return row.access_token;

  const token = newAccessToken();
  await query(
    `UPDATE proposals SET
       access_token = $1,
       access_token_created_at = CURRENT_TIMESTAMP,
       access_token_expires_at = ${tokenExpirySql()}
     WHERE proposal_id = $2`,
    [token, proposalId]
  );
  return token;
}

export async function getProposalByToken(accessToken) {
  const { rows } = await query(
    `SELECT p.*,
            b.bid_id, b.tenant_id, b.client_name, b.property_address, b.frequency,
            b.total_sq_ft, b.monthly_price, b.shift_hours, b.raw_ai_payload,
            t.name AS tenant_name, t.logo_url, t.company_email,
            t.insurance_coi_url, t.insurance_notes, t.insurance_liability_limit,
            t.insurance_coi_filename
     FROM proposals p
     JOIN bids b ON b.bid_id = p.bid_id
     JOIN tenants t ON t.tenant_id = b.tenant_id
     WHERE p.access_token = $1`,
    [accessToken]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Proposal link invalid or expired'), {
      status: 404,
      code: 'PROPOSAL_TOKEN_INVALID',
    });
  }
  const row = rows[0];
  if (
    row.access_token_expires_at &&
    new Date(row.access_token_expires_at).getTime() < Date.now()
  ) {
    throw Object.assign(
      new Error(
        'This proposal link has expired. Ask the contractor to resend the proposal.'
      ),
      { status: 410, code: 'PROPOSAL_TOKEN_EXPIRED' }
    );
  }
  return row;
}

/**
 * Persist typed or drawn signature; set Signed status.
 * signatureDataUrl: data:image/png;base64,... OR null when typed-only
 */
export async function signProposal({
  accessToken,
  signerName,
  signerEmail,
  signatureDataUrl,
  typedSignature,
}) {
  const proposal = await getProposalByToken(accessToken);
  if (proposal.status === 'Signed') {
    throw Object.assign(new Error('Proposal already signed'), { status: 409 });
  }
  if (!signerName?.trim()) {
    throw Object.assign(new Error('signer_name is required'), { status: 400 });
  }

  let signatureUrl = null;
  fs.mkdirSync(signaturesDir, { recursive: true });

  if (signatureDataUrl && String(signatureDataUrl).startsWith('data:image/')) {
    const m = String(signatureDataUrl).match(
      /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/
    );
    if (!m) {
      throw Object.assign(new Error('Invalid signature image'), { status: 400 });
    }
    const ext = m[1].includes('png') ? 'png' : 'jpg';
    const filename = `proposal-${proposal.proposal_id}-${Date.now()}.${ext}`;
    const filePath = path.join(signaturesDir, filename);
    fs.writeFileSync(filePath, Buffer.from(m[2], 'base64'));
    signatureUrl = `/signatures/${filename}`;
  } else if (typedSignature?.trim()) {
    // Store typed signature as a minimal SVG data URL persisted to disk
    const safe = escapeXml(typedSignature.trim());
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120">
      <rect width="100%" height="100%" fill="#ffffff"/>
      <text x="24" y="72" font-family="Georgia, serif" font-size="36" fill="#0f172a">${safe}</text>
    </svg>`;
    const filename = `proposal-${proposal.proposal_id}-${Date.now()}.svg`;
    const filePath = path.join(signaturesDir, filename);
    fs.writeFileSync(filePath, svg, 'utf8');
    signatureUrl = `/signatures/${filename}`;
  } else {
    throw Object.assign(
      new Error('Provide signature_data_url or typed_signature'),
      { status: 400 }
    );
  }

  const upd = await query(
    `UPDATE proposals
     SET status = 'Signed',
         signature_url = $1,
         signed_at = CURRENT_TIMESTAMP,
         signer_name = $2,
         signer_email = $3
     WHERE proposal_id = $4
     RETURNING *`,
    [
      signatureUrl,
      signerName.trim(),
      signerEmail?.trim() || null,
      proposal.proposal_id,
    ]
  );

  await syncOutcomeFromProposal(
    proposal.tenant_id,
    proposal.bid_id,
    'Signed'
  );

  return {
    proposal: upd.rows[0],
    signature_url: signedAbsoluteUrl(signatureUrl, 7 * 86400),
  };
}

export async function sendProposalEmail({
  tenantId,
  bidId,
  toEmail,
  recipientName,
}) {
  const detail = await query(
    `SELECT p.*, b.client_name, b.property_address, b.frequency, b.total_sq_ft,
            b.monthly_price, b.raw_ai_payload, b.tenant_id,
            t.name AS tenant_name, t.logo_url, t.company_email
     FROM proposals p
     JOIN bids b ON b.bid_id = p.bid_id
     JOIN tenants t ON t.tenant_id = b.tenant_id
     WHERE b.bid_id = $1 AND b.tenant_id = $2
     ORDER BY p.proposal_id ASC
     LIMIT 1`,
    [bidId, tenantId]
  );
  if (!detail.rows.length) {
    throw Object.assign(new Error('Proposal not found for bid'), { status: 404 });
  }
  const row = detail.rows[0];
  if (!toEmail?.trim()) {
    throw Object.assign(new Error('to_email is required'), { status: 400 });
  }

  const token = row.access_token || (await ensureProposalToken(row.proposal_id));
  const secureUrl = proposalSecureUrl(token);

  const payload =
    typeof row.raw_ai_payload === 'string'
      ? JSON.parse(row.raw_ai_payload)
      : row.raw_ai_payload || {};
  const ledger = payload.financial_ledger || {};
  const copy = payload.proposal_copy || {};

  const monthly =
    ledger.formatted_monthly ||
    `$${Number(row.monthly_price).toFixed(2)}`;
  const secondary = ledger.dual_currency?.formatted_monthly || null;

  // Rebuild HTML so CTA points at the live tokenized URL
  const emailHtml = buildProposalEmailHtml({
    tenantName: row.tenant_name,
    logoUrl: row.logo_url,
    clientName: recipientName || row.client_name,
    propertyAddress: row.property_address,
    totalSqFt: row.total_sq_ft,
    frequency: row.frequency,
    monthlyPriceFormatted: monthly,
    secondaryPriceFormatted: secondary,
    proposalSecureUrl: secureUrl,
    companyEmail: row.company_email,
    executiveSummary: copy.executive_summary || row.proposal_text,
    detailedScope: copy.detailed_scope_of_work || '',
  });

  const subject = `Cleaning proposal for ${row.client_name} — ${monthly}/mo`;

  const result = await sendEmail({
    tenantId,
    proposalId: row.proposal_id,
    to: toEmail.trim(),
    subject,
    html: emailHtml,
    from: row.company_email
      ? `${row.tenant_name} <${row.company_email}>`
      : undefined,
  });

  const newStatus =
    row.status === 'Signed' ? 'Signed' : 'Sent';

  await query(
    `UPDATE proposals
     SET email_html = $1,
         status = CASE WHEN status = 'Signed' THEN status ELSE $2 END,
         sent_at = CURRENT_TIMESTAMP,
         sent_to = $3,
         access_token = $4
     WHERE proposal_id = $5`,
    [emailHtml, newStatus, toEmail.trim(), token, row.proposal_id]
  );

  await syncOutcomeFromProposal(tenantId, bidId, newStatus);

  return {
    ...result,
    proposal_id: row.proposal_id,
    status: newStatus,
    proposal_secure_url: secureUrl,
    transport: emailTransportName(),
  };
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
