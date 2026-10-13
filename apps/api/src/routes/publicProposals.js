import { Router } from 'express';
import {
  getProposalByToken,
  proposalSecureUrl,
  publicBaseUrl,
  signProposal,
} from '../services/proposalActions.js';
import { buildProposalPdfBuffer } from '../services/proposalPdf.js';
import { clientMeta, writeAuditLog } from '../services/auditLog.js';
import { signedAbsoluteUrl } from '../services/signedUrls.js';

function publicArtifactUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  return signedAbsoluteUrl(pathOrUrl, 7 * 86400);
}

const router = Router();

/** JSON view for mobile / API clients */
router.get('/api/public/proposals/:token', async (req, res, next) => {
  try {
    const row = await getProposalByToken(req.params.token);
    res.json(serializePublicProposal(row));
  } catch (err) {
    next(err);
  }
});

/** Public PDF download */
router.get('/api/public/proposals/:token/pdf', async (req, res, next) => {
  try {
    const buf = await buildProposalPdfBuffer({ accessToken: req.params.token });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="omniclean-proposal.pdf"`
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

/** Sign via JSON API */
router.post('/api/public/proposals/:token/sign', async (req, res, next) => {
  try {
    const result = await signProposal({
      accessToken: req.params.token,
      signerName: req.body.signer_name,
      signerEmail: req.body.signer_email,
      signatureDataUrl: req.body.signature_data_url,
      typedSignature: req.body.typed_signature,
    });
    const meta = clientMeta(req);
    await writeAuditLog({
      tenantId: result.proposal.bid_id ? undefined : undefined,
      action: 'proposal.sign',
      resourceType: 'proposal',
      resourceId: result.proposal.proposal_id,
      ...meta,
      meta: { signer_name: result.proposal.signer_name },
    });
    // Enrich tenant from signed row if present
    if (result.proposal) {
      await writeAuditLog({
        action: 'proposal.signed',
        resourceType: 'proposal',
        resourceId: result.proposal.proposal_id,
        ...meta,
        meta: { signer_name: result.proposal.signer_name },
      });
    }
    res.json({
      status: result.proposal.status,
      signed_at: result.proposal.signed_at,
      signature_url: result.signature_url,
      signer_name: result.proposal.signer_name,
    });
  } catch (err) {
    next(err);
  }
});

/** Client portal — scope, insurance, PDF, e-sign */
router.get('/p/:token', async (req, res, next) => {
  try {
    const row = await getProposalByToken(req.params.token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderClientPortal(row, req.params.token));
  } catch (err) {
    if (err.status === 404) {
      res.status(404).send('<h1>Proposal not found</h1>');
      return;
    }
    next(err);
  }
});

router.get('/p/:token/pdf', async (req, res, next) => {
  try {
    const buf = await buildProposalPdfBuffer({ accessToken: req.params.token });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="omniclean-proposal.pdf"`
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.post('/p/:token/sign', async (req, res, next) => {
  try {
    const result = await signProposal({
      accessToken: req.params.token,
      signerName: req.body.signer_name,
      signerEmail: req.body.signer_email,
      signatureDataUrl: req.body.signature_data_url,
      typedSignature: req.body.typed_signature || req.body.signer_name,
    });
    if (req.is('application/json')) {
      return res.json({
        status: result.proposal.status,
        signed_at: result.proposal.signed_at,
        signature_url: result.signature_url,
      });
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;padding:40px;background:#f1f5f9;">
      <h1 style="color:#0f766e;">Thank you — proposal signed</h1>
      <p>Signed by ${escapeHtml(result.proposal.signer_name)} at ${escapeHtml(String(result.proposal.signed_at))}.</p>
      <p><a href="${escapeHtml(proposalSecureUrl(req.params.token))}">Return to client portal</a></p>
    </body></html>`);
  } catch (err) {
    next(err);
  }
});

function serializePublicProposal(row) {
  const payload =
    typeof row.raw_ai_payload === 'string'
      ? JSON.parse(row.raw_ai_payload)
      : row.raw_ai_payload || {};
  return {
    proposal_id: row.proposal_id,
    bid_id: row.bid_id,
    status: row.status,
    client_name: row.client_name,
    property_address: row.property_address,
    frequency: row.frequency,
    total_sq_ft: Number(row.total_sq_ft),
    monthly_price: Number(row.monthly_price),
    proposal_text: row.proposal_text,
    email_html: row.email_html,
    signed_at: row.signed_at,
    signature_url: publicArtifactUrl(row.signature_url),
    signer_name: row.signer_name,
    tenant_name: row.tenant_name,
    insurance: {
      coi_url: publicArtifactUrl(row.insurance_coi_url),
      notes: row.insurance_notes || null,
      liability_limit: row.insurance_liability_limit || null,
      filename: row.insurance_coi_filename || null,
    },
    pdf_url: `${publicBaseUrl()}/p/${row.access_token}/pdf`,
    financial_ledger: payload.financial_ledger || null,
    proposal_copy: payload.proposal_copy || null,
    crew_checklist: payload.crew_checklist || null,
  };
}

function renderClientPortal(row, token) {
  const already = row.status === 'Signed';
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
    ? `<p class="muted">Also quoted as <strong>${escapeHtml(ledger.dual_currency.formatted_monthly)}</strong> (${escapeHtml(ledger.dual_currency.currency_code)})</p>`
    : '';
  const sigAbs = publicArtifactUrl(row.signature_url);
  const sigImg = sigAbs
    ? `<p><img src="${escapeHtml(sigAbs)}" alt="Signature" style="max-width:320px;border:1px solid #e2e8f0;background:#fff;padding:8px;" /></p>`
    : '';
  const coiAbs = publicArtifactUrl(row.insurance_coi_url);

  const scopeTasks = checklist
    .map(
      (z) =>
        `<li><strong>${escapeHtml(z.room_zone)}</strong>${z.is_high_risk ? ' <span class="risk">High risk · photo QA</span>' : ''}<ul>${(z.tasks || [])
          .map((t) => `<li>${escapeHtml(t)}</li>`)
          .join('')}</ul></li>`
    )
    .join('');

  const insuranceBlock = `
    <section class="section">
      <h2>Insurance &amp; compliance</h2>
      <p class="muted">${escapeHtml(row.insurance_notes || 'Certificate of Insurance (COI) available upon request. Coverage placeholders for portal review:')}</p>
      <ul>
        <li>General liability: ${escapeHtml(row.insurance_liability_limit || 'To be confirmed — request COI')}</li>
        <li>COI document: ${
          coiAbs
            ? `<a href="${escapeHtml(coiAbs)}" target="_blank" rel="noopener">View certificate${
                row.insurance_coi_filename
                  ? ` (${escapeHtml(row.insurance_coi_filename)})`
                  : ''
              }</a>`
            : '<em>Link not yet uploaded by contractor</em>'
        }</li>
        <li>Workers’ compensation: SZV-compliant (SXM) — attestation on file with contractor</li>
      </ul>
    </section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Client portal — ${escapeHtml(row.client_name)}</title>
  <style>
    body { margin:0; background:linear-gradient(160deg,#ecfdf5 0%,#f1f5f9 42%,#e2e8f0 100%); font-family:Georgia,'Times New Roman',serif; color:#0f172a; }
    .wrap { max-width:720px; margin:0 auto; padding:32px 16px 72px; }
    .hero { background:#134e4a; color:#ecfdf5; padding:28px; border-radius:4px 4px 0 0; }
    .hero .brand { font-size:13px; letter-spacing:.06em; text-transform:uppercase; color:#99f6e4; }
    .hero h1 { font-weight:normal; font-size:28px; margin:10px 0 6px; }
    .card { background:#fff; padding:28px; border-radius:0 0 4px 4px; box-shadow:0 1px 0 rgba(15,23,42,.06); }
    .price { font-size:34px; color:#0f766e; margin:8px 0; }
    .section { margin-top:28px; padding-top:20px; border-top:1px solid #e2e8f0; }
    .section h2 { font-size:18px; font-weight:normal; margin:0 0 10px; }
    .muted { color:#64748b; line-height:1.55; }
    .actions { display:flex; flex-wrap:wrap; gap:10px; margin:18px 0; }
    .actions a, button { display:inline-block; background:#0f766e; color:#fff; text-decoration:none; border:0; padding:12px 16px; border-radius:4px; font-size:15px; cursor:pointer; font-family:system-ui,sans-serif; }
    .actions a.secondary, button.secondary { background:#e2e8f0; color:#334155; }
    label { display:block; margin-top:14px; font-size:13px; color:#475569; font-family:system-ui,sans-serif; font-weight:600; }
    input { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cbd5e1; border-radius:4px; font-size:16px; }
    canvas { width:100%; height:140px; border:1px dashed #94a3b8; border-radius:4px; touch-action:none; background:#f8fafc; margin-top:6px; }
    .done { background:#ecfdf5; border-left:3px solid #0f766e; padding:12px 14px; margin:16px 0; }
    .risk { color:#b45309; font-size:12px; font-family:system-ui,sans-serif; }
    ul { padding-left:1.2em; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="brand">${escapeHtml(row.tenant_name || 'OmniClean')} · Client portal</div>
      <h1>${escapeHtml(row.client_name)}</h1>
      <p style="margin:0;color:#99f6e4;">${escapeHtml(row.property_address || '')} · ${escapeHtml(row.frequency || '')} · ${Number(row.total_sq_ft).toLocaleString()} sq ft</p>
    </div>
    <div class="card">
      <div class="price">${escapeHtml(monthly)}<span style="font-size:16px;color:#64748b;"> / month</span></div>
      ${dual}
      <div class="actions">
        <a href="/p/${escapeHtml(token)}/pdf">Download PDF proposal</a>
        <a class="secondary" href="#scope">Review scope</a>
        <a class="secondary" href="#sign">E-sign</a>
      </div>

      <section class="section" id="summary">
        <h2>Executive summary</h2>
        <p class="muted">${escapeHtml(copy.executive_summary || row.proposal_text || '')}</p>
      </section>

      <section class="section" id="scope">
        <h2>Scope of work</h2>
        <p class="muted">${escapeHtml(copy.detailed_scope_of_work || '')}</p>
        ${scopeTasks ? `<ol>${scopeTasks}</ol>` : ''}
      </section>

      ${insuranceBlock}

      <section class="section" id="sign">
        <h2>Accept &amp; sign</h2>
        ${
          already
            ? `<div class="done"><strong>Already signed</strong> by ${escapeHtml(row.signer_name || '')} on ${escapeHtml(String(row.signed_at || ''))}.</div>${sigImg}`
            : `<form id="signForm" method="post" action="/p/${escapeHtml(token)}/sign">
          <label>Full name</label>
          <input name="signer_name" id="signer_name" required placeholder="Authorized signer" />
          <label>Email</label>
          <input name="signer_email" type="email" placeholder="you@company.com" />
          <label>Type your signature</label>
          <input name="typed_signature" id="typed_signature" placeholder="Type name as signature" />
          <label>Or draw signature</label>
          <canvas id="pad" width="640" height="140"></canvas>
          <input type="hidden" name="signature_data_url" id="signature_data_url" />
          <div class="actions">
            <button type="submit">Accept &amp; sign</button>
            <button type="button" class="secondary" id="clearPad">Clear pad</button>
          </div>
        </form>`
        }
      </section>
      <p class="muted" style="margin-top:28px;font-size:12px;font-family:system-ui,sans-serif;">Powered by OmniClean AI Scanner · ${escapeHtml(row.company_email || '')}</p>
    </div>
  </div>
  <script>
    (function() {
      var canvas = document.getElementById('pad');
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      var drawing = false;
      function pos(e) {
        var r = canvas.getBoundingClientRect();
        var x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
        var y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
        return { x: x * (canvas.width / r.width), y: y * (canvas.height / r.height) };
      }
      function start(e) { drawing = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
      function move(e) { if (!drawing) return; var p = pos(e); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#0f172a'; ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
      function end() { drawing = false; }
      canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', move);
      canvas.addEventListener('mouseup', end); canvas.addEventListener('mouseleave', end);
      canvas.addEventListener('touchstart', start, {passive:false}); canvas.addEventListener('touchmove', move, {passive:false});
      canvas.addEventListener('touchend', end);
      document.getElementById('clearPad').onclick = function() { ctx.clearRect(0,0,canvas.width,canvas.height); };
      document.getElementById('signForm').addEventListener('submit', function() {
        var blank = !ctx.getImageData(0,0,canvas.width,canvas.height).data.some(function(c,i){ return i%4!==3 && c!==0; });
        if (!blank) document.getElementById('signature_data_url').value = canvas.toDataURL('image/png');
        var typed = document.getElementById('typed_signature');
        if (!typed.value) typed.value = document.getElementById('signer_name').value;
      });
    })();
  </script>
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

export default router;
