import { Router } from 'express';
import {
  getProposalByToken,
  proposalSecureUrl,
  publicBaseUrl,
  signProposal,
} from '../services/proposalActions.js';

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

/** Simple web accept / e-sign page */
router.get('/p/:token', async (req, res, next) => {
  try {
    const row = await getProposalByToken(req.params.token);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderAcceptPage(row, req.params.token));
  } catch (err) {
    if (err.status === 404) {
      res.status(404).send('<h1>Proposal not found</h1>');
      return;
    }
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
    // Form posts get a thank-you page; JSON clients get JSON
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
      <p><a href="${escapeHtml(proposalSecureUrl(req.params.token))}">View signed proposal</a></p>
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
    status: row.status,
    client_name: row.client_name,
    property_address: row.property_address,
    frequency: row.frequency,
    total_sq_ft: Number(row.total_sq_ft),
    monthly_price: Number(row.monthly_price),
    proposal_text: row.proposal_text,
    email_html: row.email_html,
    signed_at: row.signed_at,
    signature_url: row.signature_url
      ? `${publicBaseUrl()}${row.signature_url}`
      : null,
    signer_name: row.signer_name,
    tenant_name: row.tenant_name,
    financial_ledger: payload.financial_ledger || null,
    proposal_copy: payload.proposal_copy || null,
  };
}

function renderAcceptPage(row, token) {
  const already = row.status === 'Signed';
  const monthly = Number(row.monthly_price).toFixed(2);
  const sigImg = row.signature_url
    ? `<p><img src="${escapeHtml(row.signature_url)}" alt="Signature" style="max-width:320px;border:1px solid #e2e8f0;background:#fff;padding:8px;" /></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Proposal — ${escapeHtml(row.client_name)}</title>
  <style>
    body { margin:0; background:linear-gradient(160deg,#ecfdf5,#f1f5f9 45%,#e2e8f0); font-family:Georgia,'Times New Roman',serif; color:#0f172a; }
    .wrap { max-width:640px; margin:0 auto; padding:32px 16px 64px; }
    .card { background:#fff; border-radius:4px; padding:28px; box-shadow:0 1px 0 rgba(15,23,42,.06); }
    h1 { font-weight:normal; font-size:28px; margin:0 0 8px; }
    .brand { color:#0f766e; font-size:14px; letter-spacing:.04em; text-transform:uppercase; margin-bottom:12px; }
    .price { font-size:32px; color:#0f766e; margin:12px 0; }
    label { display:block; margin-top:14px; font-size:13px; color:#475569; font-family:system-ui,sans-serif; font-weight:600; }
    input { width:100%; box-sizing:border-box; padding:10px 12px; border:1px solid #cbd5e1; border-radius:4px; font-size:16px; }
    canvas { width:100%; height:140px; border:1px dashed #94a3b8; border-radius:4px; touch-action:none; background:#f8fafc; margin-top:6px; }
    button { margin-top:18px; background:#0f766e; color:#fff; border:0; padding:12px 18px; border-radius:4px; font-size:16px; cursor:pointer; font-family:system-ui,sans-serif; }
    button.secondary { background:#e2e8f0; color:#334155; margin-left:8px; }
    .muted { color:#64748b; line-height:1.5; }
    .done { background:#ecfdf5; border-left:3px solid #0f766e; padding:12px 14px; margin:16px 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="brand">${escapeHtml(row.tenant_name || 'OmniClean')}</div>
      <h1>Proposal for ${escapeHtml(row.client_name)}</h1>
      <p class="muted">${escapeHtml(row.property_address || '')} · ${escapeHtml(row.frequency || '')} · ${Number(row.total_sq_ft).toLocaleString()} sq ft</p>
      <div class="price">$${monthly}<span style="font-size:16px;color:#64748b;"> / month</span></div>
      <p class="muted">${escapeHtml(row.proposal_text || '').slice(0, 800)}</p>
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
        <div>
          <button type="submit">Accept &amp; sign</button>
          <button type="button" class="secondary" id="clearPad">Clear pad</button>
        </div>
      </form>`
      }
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
