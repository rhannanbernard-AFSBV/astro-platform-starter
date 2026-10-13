import { query } from '../db/client.js';
import { logGpsEvent } from './crewGps.js';
import { uploadQaPhoto } from './photoQa.js';

/**
 * Apply offline-queued crew events when device comes online.
 * Events: room_complete | clock_in | clock_out | qa_photo (base64)
 */
export async function applyOfflineSyncBatch({
  tenantId,
  userId,
  bidId,
  clientBatchId,
  events = [],
}) {
  if (!Array.isArray(events) || !events.length) {
    throw Object.assign(new Error('events array required'), { status: 400 });
  }

  const bid = await query(
    'SELECT bid_id FROM bids WHERE bid_id = $1 AND tenant_id = $2',
    [bidId, tenantId]
  );
  if (!bid.rows.length) {
    throw Object.assign(new Error('Bid not found'), { status: 404 });
  }

  const results = [];
  let applied = 0;

  for (const [index, ev] of events.entries()) {
    try {
      if (
        ev.event_type === 'clock_in' ||
        ev.event_type === 'clock_out' ||
        ev.event_type === 'room_complete' ||
        ev.event_type === 'heartbeat'
      ) {
        const out = await logGpsEvent({
          tenantId,
          userId,
          bidId,
          checklistId: ev.checklist_id,
          eventType: ev.event_type,
          latitude: ev.latitude,
          longitude: ev.longitude,
          accuracyM: ev.accuracy_m,
          notes: ev.notes || `offline sync ${clientBatchId || ''}`.trim(),
        });
        results.push({ index, ok: true, type: ev.event_type, event: out.event });
        applied += 1;
      } else if (ev.event_type === 'qa_photo') {
        if (!ev.photo_base64) {
          throw new Error('qa_photo requires photo_base64');
        }
        const buf = Buffer.from(ev.photo_base64, 'base64');
        const out = await uploadQaPhoto({
          tenantId,
          userId,
          bidId,
          checklistId: Number(ev.checklist_id),
          imageBuffer: buf,
          mimeType: ev.mime_type || 'image/jpeg',
          notes: ev.notes || 'offline QA sync',
        });
        results.push({
          index,
          ok: true,
          type: 'qa_photo',
          checklist_id: out.checklist_id,
        });
        applied += 1;
      } else {
        results.push({
          index,
          ok: false,
          error: `Unknown event_type ${ev.event_type}`,
        });
      }
    } catch (err) {
      results.push({
        index,
        ok: false,
        error: err.message,
        geofence_violation: Boolean(err.geofence_violation),
      });
    }
  }

  const { rows } = await query(
    `INSERT INTO offline_sync_batches (
       tenant_id, user_id, bid_id, client_batch_id, events_count, applied_count, payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING batch_id, created_at`,
    [
      tenantId,
      userId || null,
      bidId,
      clientBatchId || null,
      events.length,
      applied,
      JSON.stringify({ results }),
    ]
  );

  return {
    batch_id: rows[0].batch_id,
    events_count: events.length,
    applied_count: applied,
    results,
  };
}
