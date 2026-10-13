import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import {
  getHighRiskQaStatus,
  listQaPhotos,
  uploadQaPhoto,
} from '../services/photoQa.js';
import {
  getGeofence,
  listGpsEvents,
  logGpsEvent,
  upsertGeofence,
} from '../services/crewGps.js';
import { buildProposalPdfBuffer } from '../services/proposalPdf.js';
import { getAdminSettings, updateAdminSettings } from '../services/tenantAdmin.js';
import {
  getAnalytics,
  listBidHistory,
  setBidOutcome,
} from '../services/analytics.js';
import { registerPushDevice } from '../services/pushNotify.js';
import { applyOfflineSyncBatch } from '../services/offlineSync.js';
import { query } from '../db/client.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { signedAbsoluteUrl } from '../services/signedUrls.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coiDir = path.resolve(__dirname, '../../data/insurance');

const router = Router();
router.use(requireAuth);

// —— Photo QA ——
router.get('/bids/:bidId/qa', async (req, res, next) => {
  try {
    const bidId = Number(req.params.bidId);
    const [status, photos] = await Promise.all([
      getHighRiskQaStatus(req.tenantId, bidId),
      listQaPhotos(req.tenantId, bidId),
    ]);
    res.json({ ...status, photos });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/bids/:bidId/checklist/:checklistId/qa-photo',
  upload.single('photo'),
  async (req, res, next) => {
    try {
      const result = await uploadQaPhoto({
        tenantId: req.tenantId,
        userId: req.user.user_id,
        bidId: Number(req.params.bidId),
        checklistId: Number(req.params.checklistId),
        imageBuffer: req.file?.buffer,
        mimeType: req.file?.mimetype,
        notes: req.body.notes,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

// —— Crew GPS ——
router.get('/bids/:bidId/geofence', async (req, res, next) => {
  try {
    const geofence = await getGeofence(req.tenantId, Number(req.params.bidId));
    res.json({ geofence });
  } catch (err) {
    next(err);
  }
});

router.put('/bids/:bidId/geofence', async (req, res, next) => {
  try {
    const geofence = await upsertGeofence({
      tenantId: req.tenantId,
      bidId: Number(req.params.bidId),
      centerLat: req.body.center_lat,
      centerLng: req.body.center_lng,
      radiusM: req.body.radius_m,
      label: req.body.label,
    });
    res.json({ geofence });
  } catch (err) {
    next(err);
  }
});

router.get('/bids/:bidId/gps', async (req, res, next) => {
  try {
    const events = await listGpsEvents(req.tenantId, Number(req.params.bidId));
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

router.post('/bids/:bidId/gps', async (req, res, next) => {
  try {
    const result = await logGpsEvent({
      tenantId: req.tenantId,
      userId: req.user.user_id,
      bidId: Number(req.params.bidId),
      checklistId: req.body.checklist_id
        ? Number(req.body.checklist_id)
        : undefined,
      eventType: req.body.event_type,
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      accuracyM: req.body.accuracy_m,
      notes: req.body.notes,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// —— PDF ——
router.get('/bids/:bidId/proposal.pdf', async (req, res, next) => {
  try {
    const buf = await buildProposalPdfBuffer({
      tenantId: req.tenantId,
      bidId: Number(req.params.bidId),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="omniclean-proposal-${req.params.bidId}.pdf"`
    );
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// —— Tenant admin ——
router.get('/admin/settings', async (req, res, next) => {
  try {
    const settings = await getAdminSettings(req.tenantId);
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.patch('/admin/settings', async (req, res, next) => {
  try {
    const settings = await updateAdminSettings(req.tenantId, req.body, {
      isPlatformAdmin: Boolean(req.user?.is_master),
    });
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/** Upload COI (PDF/image) for tenant — shown on client portal */
router.post(
  '/admin/insurance/coi',
  upload.single('coi'),
  async (req, res, next) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'coi file is required' });
      }
      fs.mkdirSync(coiDir, { recursive: true });
      const ext = (req.file.mimetype || '').includes('png')
        ? 'png'
        : (req.file.mimetype || '').includes('pdf')
          ? 'pdf'
          : 'jpg';
      const filename = `tenant-${req.tenantId}-coi-${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(coiDir, filename), req.file.buffer);
      const url = `/insurance/${filename}`;
      await query(
        `UPDATE tenants SET insurance_coi_url = $1, insurance_coi_filename = $2
         WHERE tenant_id = $3`,
        [url, req.file.originalname || filename, req.tenantId]
      );
      res.status(201).json({
        insurance_coi_url: signedAbsoluteUrl(url, 7 * 86400),
        insurance_coi_path: url,
        filename: req.file.originalname || filename,
      });
    } catch (err) {
      next(err);
    }
  }
);

// —— Bid history & analytics (paths avoid clashing with /bids/:bidId) ——
router.get('/history/bids', async (req, res, next) => {
  try {
    const bids = await listBidHistory(req.tenantId, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    res.json({ bids });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics/summary', async (req, res, next) => {
  try {
    const analytics = await getAnalytics(req.tenantId);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
});

router.post('/bids/:bidId/outcome', async (req, res, next) => {
  try {
    const bid = await setBidOutcome(
      req.tenantId,
      Number(req.params.bidId),
      req.body.outcome,
      {
        lossReason: req.body.loss_reason,
        lossNotes: req.body.loss_notes,
        competitorPrice: req.body.competitor_price,
      }
    );
    res.json({ bid });
  } catch (err) {
    next(err);
  }
});

/** Geocode property address → lat/lng for site geofence (Nominatim / operator override) */
router.post('/bids/:bidId/geofence/from-address', async (req, res, next) => {
  try {
    const bidId = Number(req.params.bidId);
    const bid = await query(
      'SELECT bid_id, property_address FROM bids WHERE bid_id = $1 AND tenant_id = $2',
      [bidId, req.tenantId]
    );
    if (!bid.rows.length) {
      return res.status(404).json({ error: 'Bid not found' });
    }
    const address =
      (req.body.address || bid.rows[0].property_address || '').trim();
    if (!address) {
      return res.status(400).json({ error: 'address required' });
    }

    // Optional operator pin override
    if (req.body.center_lat != null && req.body.center_lng != null) {
      const geofence = await upsertGeofence({
        tenantId: req.tenantId,
        bidId,
        centerLat: req.body.center_lat,
        centerLng: req.body.center_lng,
        radiusM: req.body.radius_m || 200,
        label: req.body.label || address,
      });
      return res.json({ geofence, source: 'manual_pin' });
    }

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', address);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    const geoRes = await fetch(url, {
      headers: {
        'User-Agent': 'OmniCleanAIScanner/0.1 (ops geofence)',
        Accept: 'application/json',
      },
    });
    if (!geoRes.ok) {
      return res.status(502).json({
        error: `Geocoder HTTP ${geoRes.status}`,
        code: 'GEOCODER_FAILED',
      });
    }
    const hits = await geoRes.json();
    if (!Array.isArray(hits) || !hits.length) {
      return res.status(404).json({
        error: 'No geocode result for address — set center_lat/center_lng manually',
        code: 'GEOCODE_NOT_FOUND',
        address,
      });
    }
    const geofence = await upsertGeofence({
      tenantId: req.tenantId,
      bidId,
      centerLat: Number(hits[0].lat),
      centerLng: Number(hits[0].lon),
      radiusM: req.body.radius_m || 200,
      label: req.body.label || address,
    });
    res.json({
      geofence,
      source: 'nominatim',
      display_name: hits[0].display_name,
    });
  } catch (err) {
    next(err);
  }
});

// —— Push stubs ——
router.post('/push/register', async (req, res, next) => {
  try {
    const device = await registerPushDevice({
      tenantId: req.tenantId,
      userId: req.user.user_id,
      pushToken: req.body.push_token,
      platform: req.body.platform || 'expo',
    });
    res.status(201).json({ device });
  } catch (err) {
    next(err);
  }
});

// —— Offline sync ——
router.post('/bids/:bidId/offline-sync', async (req, res, next) => {
  try {
    const result = await applyOfflineSyncBatch({
      tenantId: req.tenantId,
      userId: req.user.user_id,
      bidId: Number(req.params.bidId),
      clientBatchId: req.body.client_batch_id,
      events: req.body.events || [],
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
