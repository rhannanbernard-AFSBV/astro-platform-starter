import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db/client.js';
import { publicBaseUrl } from './proposalActions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const qaDir = path.resolve(__dirname, '../../data/qa-photos');

/**
 * High-risk checklist zones require photo verification tied to AI audit prompts.
 */
export async function uploadQaPhoto({
  tenantId,
  userId,
  bidId,
  checklistId,
  imageBuffer,
  mimeType,
  notes,
}) {
  const checklist = await query(
    `SELECT c.*, b.tenant_id
     FROM bid_checklists c
     JOIN bids b ON b.bid_id = c.bid_id
     WHERE c.checklist_id = $1 AND c.bid_id = $2 AND b.tenant_id = $3`,
    [checklistId, bidId, tenantId]
  );
  if (!checklist.rows.length) {
    throw Object.assign(new Error('Checklist item not found'), { status: 404 });
  }
  const item = checklist.rows[0];
  if (!item.is_high_risk) {
    throw Object.assign(
      new Error('Photo QA is only required for high-risk zones'),
      { status: 400 }
    );
  }
  if (!imageBuffer?.length) {
    throw Object.assign(new Error('photo file is required'), { status: 400 });
  }

  fs.mkdirSync(qaDir, { recursive: true });
  const ext = (mimeType || '').includes('png') ? 'png' : 'jpg';
  const filename = `bid-${bidId}-cl-${checklistId}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(qaDir, filename), imageBuffer);
  const photoUrl = `/qa-photos/${filename}`;

  const ins = await query(
    `INSERT INTO checklist_qa_photos (
       tenant_id, bid_id, checklist_id, photo_url, ai_audit_prompt, notes, uploaded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [
      tenantId,
      bidId,
      checklistId,
      photoUrl,
      item.ai_audit_prompt,
      notes || null,
      userId || null,
    ]
  );

  await query(
    `UPDATE bid_checklists
     SET qa_verified_at = CURRENT_TIMESTAMP, qa_photo_url = $1
     WHERE checklist_id = $2`,
    [photoUrl, checklistId]
  );

  return {
    qa_photo: {
      ...ins.rows[0],
      photo_absolute_url: `${publicBaseUrl()}${photoUrl}`,
    },
    checklist_id: checklistId,
    ai_audit_prompt: item.ai_audit_prompt,
    verified: true,
  };
}

export async function listQaPhotos(tenantId, bidId) {
  const { rows } = await query(
    `SELECT q.*, c.room_zone, c.is_high_risk, c.ai_audit_prompt AS zone_audit_prompt
     FROM checklist_qa_photos q
     JOIN bid_checklists c ON c.checklist_id = q.checklist_id
     JOIN bids b ON b.bid_id = q.bid_id
     WHERE q.bid_id = $1 AND b.tenant_id = $2
     ORDER BY q.created_at DESC`,
    [bidId, tenantId]
  );
  return rows.map((r) => ({
    ...r,
    photo_absolute_url: `${publicBaseUrl()}${r.photo_url}`,
  }));
}

export async function getHighRiskQaStatus(tenantId, bidId) {
  const { rows } = await query(
    `SELECT checklist_id, room_zone, ai_audit_prompt, qa_verified_at, qa_photo_url
     FROM bid_checklists c
     JOIN bids b ON b.bid_id = c.bid_id
     WHERE c.bid_id = $1 AND b.tenant_id = $2 AND c.is_high_risk = TRUE
     ORDER BY c.checklist_id`,
    [bidId, tenantId]
  );
  const pending = rows.filter((r) => !r.qa_verified_at);
  return {
    high_risk_zones: rows.length,
    verified: rows.length - pending.length,
    pending: pending.length,
    zones: rows.map((r) => ({
      ...r,
      photo_absolute_url: r.qa_photo_url
        ? `${publicBaseUrl()}${r.qa_photo_url}`
        : null,
    })),
  };
}
