import { Router } from 'express';
import multer from 'multer';
import {
  createBidFromWalkthrough,
  getBid,
  listBids,
  getTenantSettings,
} from '../services/bidService.js';
import { requireAuth } from '../middleware/auth.js';
import {
  proposalSecureUrl,
  sendProposalEmail,
} from '../services/proposalActions.js';
import { emailTransportName } from '../services/email.js';
import { providerStatus, resolveVisionMode } from '../services/providers.js';
import { clientMeta, writeAuditLog } from '../services/auditLog.js';
import { scanRateLimit } from '../middleware/security.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'omniclean-api',
    auth_required: true,
    ...providerStatus(),
  });
});

// All routes below require JWT; tenant_id comes from the token
router.use(requireAuth);

router.get('/settings', async (req, res, next) => {
  try {
    const ctx = await getTenantSettings(req.tenantId);
    res.json({
      tenant_id: ctx.tenant.tenant_id,
      name: ctx.tenant.name,
      jurisdiction_code: ctx.tenant.jurisdiction_code,
      currency: {
        primary: ctx.primaryCurrency,
        secondary: ctx.secondaryCurrency,
        enable_dual_quoting: ctx.tenant.enable_dual_quoting,
      },
      labor: {
        base_hourly_wage: ctx.tenant.base_hourly_wage,
        target_margin_percentage: ctx.tenant.target_margin_percentage,
        shifts_per_year: ctx.tenant.shifts_per_year,
        facility_density_code: ctx.tenant.facility_density_code,
      },
      tax: {
        tot_rate: ctx.jurisdiction.tot_rate,
        labor_burden_multiplier: ctx.jurisdiction.labor_burden_multiplier,
        consumables_rate: ctx.jurisdiction.consumables_rate,
      },
      issa: ctx.issaRate,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/bids', async (req, res, next) => {
  try {
    const bids = await listBids(req.tenantId);
    res.json({ bids });
  } catch (err) {
    next(err);
  }
});

router.get('/bids/:bidId', async (req, res, next) => {
  try {
    const detail = await getBid(req.tenantId, Number(req.params.bidId));
    res.json(enrichProposalLinks(detail));
  } catch (err) {
    next(err);
  }
});

router.get('/bids/:bidId/checklist', async (req, res, next) => {
  try {
    const detail = await getBid(req.tenantId, Number(req.params.bidId));
    res.json({
      bid_id: detail.bid.bid_id,
      checklists: detail.checklists,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/bids/:bidId/proposal', async (req, res, next) => {
  try {
    const detail = await getBid(req.tenantId, Number(req.params.bidId));
    const proposal = detail.proposals[0] || null;
    res.json({
      bid_id: detail.bid.bid_id,
      proposal: proposal
        ? {
            ...proposal,
            proposal_secure_url: proposal.access_token
              ? proposalSecureUrl(proposal.access_token)
              : null,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Send proposal email (localized HTML template) to client.
 * POST /api/bids/:bidId/send-proposal  { to_email, recipient_name? }
 */
router.post('/bids/:bidId/send-proposal', async (req, res, next) => {
  try {
    const result = await sendProposalEmail({
      tenantId: req.tenantId,
      bidId: Number(req.params.bidId),
      toEmail: req.body.to_email,
      recipientName: req.body.recipient_name,
    });
    const meta = clientMeta(req);
    await writeAuditLog({
      tenantId: req.tenantId,
      userId: req.user.user_id,
      action: 'proposal.send',
      resourceType: 'bid',
      resourceId: req.params.bidId,
      ...meta,
      meta: { to: req.body.to_email, transport: result.transport },
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Working demo path: upload/walkthrough → bid ledger → checklist → proposal draft
 */
router.post('/scan', scanRateLimit, upload.single('image'), async (req, res, next) => {
  try {
    const clientName = (req.body.client_name || '').trim();
    if (!clientName) {
      return res.status(400).json({ error: 'client_name is required' });
    }

    const forceMock =
      req.body.mock === '1' || req.body.mock === 'true';
    const vision = resolveVisionMode({
      forceMock,
      hasImage: Boolean(req.file?.buffer?.length),
    });

    const result = await createBidFromWalkthrough({
      tenantId: req.tenantId,
      clientName,
      propertyAddress: req.body.property_address || '',
      frequency: req.body.frequency || '5x / week',
      imageBuffer: req.file?.buffer,
      mimeType: req.file?.mimetype || 'image/jpeg',
      hintSqFt: req.body.hint_sq_ft ? Number(req.body.hint_sq_ft) : undefined,
      useMock: vision.useMock,
    });

    const secureUrl = result.proposal.access_token
      ? proposalSecureUrl(result.proposal.access_token)
      : null;

    const crew_checklist = (result.payload.crew_checklist || []).map(
      (zone, i) => ({
        ...zone,
        checklist_id: result.checklists[i]?.checklist_id,
      })
    );

    const meta = clientMeta(req);
    await writeAuditLog({
      tenantId: req.tenantId,
      userId: req.user.user_id,
      action: 'bid.scan',
      resourceType: 'bid',
      resourceId: result.bid.bid_id,
      ...meta,
      meta: {
        vision_mode: vision.reason,
        extraction_source: result.payload.meta?.extraction_source,
      },
    });

    res.status(201).json({
      bid_id: result.bid.bid_id,
      proposal_id: result.proposal.proposal_id,
      spatial_summary: result.payload.spatial_summary,
      scale_and_legend: result.payload.scale_and_legend,
      financial_ledger: result.payload.financial_ledger,
      proposal_copy: result.payload.proposal_copy,
      crew_checklist,
      meta: {
        ...result.payload.meta,
        vision_mode: vision.reason,
      },
      proposal: {
        status: result.proposal.status,
        email_html: result.proposal.email_html,
        proposal_text: result.proposal.proposal_text,
        access_token: result.proposal.access_token,
        proposal_secure_url: secureUrl,
        access_token_expires_at: result.proposal.access_token_expires_at,
      },
      pdf_url: `/api/bids/${result.bid.bid_id}/proposal.pdf`,
    });
  } catch (err) {
    next(err);
  }
});

function enrichProposalLinks(detail) {
  return {
    ...detail,
    proposals: (detail.proposals || []).map((p) => ({
      ...p,
      proposal_secure_url: p.access_token
        ? proposalSecureUrl(p.access_token)
        : null,
    })),
  };
}

export default router;
