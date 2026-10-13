import PDFDocument from 'pdfkit';
import { query } from '../db/client.js';
import { publicBaseUrl } from './proposalActions.js';

/**
 * Compile proposal scope into a branded downloadable PDF.
 */
export async function buildProposalPdfBuffer({ tenantId, bidId, accessToken }) {
  let row;
  if (accessToken) {
    const r = await query(
      `SELECT p.*, b.client_name, b.property_address, b.frequency, b.total_sq_ft,
              b.monthly_price, b.shift_hours, b.raw_ai_payload, b.tenant_id,
              t.name AS tenant_name, t.company_email, t.logo_url,
              t.insurance_coi_url, t.insurance_notes, t.insurance_liability_limit
       FROM proposals p
       JOIN bids b ON b.bid_id = p.bid_id
       JOIN tenants t ON t.tenant_id = b.tenant_id
       WHERE p.access_token = $1`,
      [accessToken]
    );
    row = r.rows[0];
  } else {
    const r = await query(
      `SELECT p.*, b.client_name, b.property_address, b.frequency, b.total_sq_ft,
              b.monthly_price, b.shift_hours, b.raw_ai_payload, b.tenant_id,
              t.name AS tenant_name, t.company_email, t.logo_url,
              t.insurance_coi_url, t.insurance_notes, t.insurance_liability_limit
       FROM proposals p
       JOIN bids b ON b.bid_id = p.bid_id
       JOIN tenants t ON t.tenant_id = b.tenant_id
       WHERE b.bid_id = $1 AND b.tenant_id = $2
       ORDER BY p.proposal_id ASC LIMIT 1`,
      [bidId, tenantId]
    );
    row = r.rows[0];
  }

  if (!row) {
    throw Object.assign(new Error('Proposal not found'), { status: 404 });
  }

  const payload =
    typeof row.raw_ai_payload === 'string'
      ? JSON.parse(row.raw_ai_payload)
      : row.raw_ai_payload || {};
  const ledger = payload.financial_ledger || {};
  const copy = payload.proposal_copy || {};
  const checklist = payload.crew_checklist || [];

  const monthly =
    ledger.formatted_monthly || `$${Number(row.monthly_price).toFixed(2)}`;
  const dual = ledger.dual_currency?.formatted_monthly
    ? ` / ${ledger.dual_currency.formatted_monthly}`
    : '';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 54, size: 'LETTER' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Brand header
    doc.rect(0, 0, doc.page.width, 72).fill('#134e4a');
    doc
      .fillColor('#ecfdf5')
      .font('Times-Bold')
      .fontSize(22)
      .text(row.tenant_name || 'OmniClean', 54, 28, { continued: false });
    doc
      .fillColor('#99f6e4')
      .font('Times-Roman')
      .fontSize(11)
      .text('Commercial Cleaning Proposal', 54, 52);

    doc.moveDown(2);
    doc.fillColor('#0f172a').font('Times-Bold').fontSize(18);
    doc.text(`Prepared for ${row.client_name}`);
    doc.moveDown(0.4);
    doc.font('Times-Roman').fontSize(11).fillColor('#334155');
    doc.text(`Property: ${row.property_address || '—'}`);
    doc.text(
      `Area: ${Number(row.total_sq_ft).toLocaleString()} cleanable sq ft · Frequency: ${row.frequency || '—'}`
    );
    doc.text(`Status: ${row.status}${row.signed_at ? ` · Signed ${row.signed_at}` : ''}`);

    doc.moveDown(1);
    doc.font('Times-Bold').fontSize(28).fillColor('#0f766e');
    doc.text(`${monthly}${dual}`);
    doc.font('Times-Roman').fontSize(11).fillColor('#64748b');
    doc.text('Monthly flat invoice (taxes & margin included per ledger)');

    doc.moveDown(1.2);
    doc.font('Times-Bold').fontSize(13).fillColor('#0f172a');
    doc.text('Executive summary');
    doc.font('Times-Roman').fontSize(11).fillColor('#334155');
    doc.text(copy.executive_summary || row.proposal_text || '', {
      align: 'left',
    });

    doc.moveDown(1);
    doc.font('Times-Bold').fontSize(13).fillColor('#0f172a');
    doc.text('Detailed scope of work');
    doc.font('Times-Roman').fontSize(11).fillColor('#334155');
    doc.text(copy.detailed_scope_of_work || '', { align: 'left' });

    if (checklist.length) {
      doc.moveDown(1);
      doc.font('Times-Bold').fontSize(13).fillColor('#0f172a');
      doc.text('Crew checklist (preview)');
      doc.font('Times-Roman').fontSize(10).fillColor('#334155');
      for (const zone of checklist.slice(0, 12)) {
        const risk = zone.is_high_risk ? ' [HIGH RISK]' : '';
        doc.text(`• ${zone.room_zone}${risk}`);
      }
    }

    doc.moveDown(1);
    doc.font('Times-Bold').fontSize(13).fillColor('#0f172a');
    doc.text('Insurance');
    doc.font('Times-Roman').fontSize(11).fillColor('#334155');
    doc.text(
      row.insurance_liability_limit
        ? `General liability: ${row.insurance_liability_limit}`
        : 'General liability: Certificate of Insurance available on request'
    );
    if (row.insurance_notes) doc.text(row.insurance_notes);
    if (row.insurance_coi_url) doc.text(`COI link: ${row.insurance_coi_url}`);

    doc.moveDown(1.5);
    doc.fontSize(9).fillColor('#94a3b8');
    doc.text(
      `${row.tenant_name || 'OmniClean'} · ${row.company_email || ''} · Generated by OmniClean AI Scanner · ${publicBaseUrl()}`,
      { align: 'left' }
    );

    doc.end();
  });
}
