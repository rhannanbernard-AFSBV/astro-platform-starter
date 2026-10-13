import { Router } from 'express';
import multer from 'multer';
import {
  createBidFromWalkthrough,
  getBid,
  listBids,
  getTenantSettings,
} from '../services/bidService.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'omniclean-api',
    openai_configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  });
});

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
    res.json(detail);
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
    res.json({ bid_id: detail.bid.bid_id, proposal });
  } catch (err) {
    next(err);
  }
});

/**
 * Working demo path: upload/walkthrough → bid ledger → checklist → proposal draft
 * POST /api/scan  multipart: image?, client_name, property_address, frequency, hint_sq_ft, mock=1
 */
router.post('/scan', upload.single('image'), async (req, res, next) => {
  try {
    const clientName = (req.body.client_name || '').trim();
    if (!clientName) {
      return res.status(400).json({ error: 'client_name is required' });
    }

    const useMock =
      req.body.mock === '1' ||
      req.body.mock === 'true' ||
      !req.file ||
      !process.env.OPENAI_API_KEY?.trim();

    const result = await createBidFromWalkthrough({
      tenantId: req.tenantId,
      clientName,
      propertyAddress: req.body.property_address || '',
      frequency: req.body.frequency || '5x / week',
      imageBuffer: req.file?.buffer,
      mimeType: req.file?.mimetype || 'image/jpeg',
      hintSqFt: req.body.hint_sq_ft ? Number(req.body.hint_sq_ft) : undefined,
      useMock,
    });

    res.status(201).json({
      bid_id: result.bid.bid_id,
      proposal_id: result.proposal.proposal_id,
      spatial_summary: result.payload.spatial_summary,
      financial_ledger: result.payload.financial_ledger,
      proposal_copy: result.payload.proposal_copy,
      crew_checklist: result.payload.crew_checklist,
      meta: result.payload.meta,
      proposal: {
        status: result.proposal.status,
        email_html: result.proposal.email_html,
        proposal_text: result.proposal.proposal_text,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
