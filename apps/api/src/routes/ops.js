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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

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
    const settings = await updateAdminSettings(req.tenantId, req.body);
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

export default router;
