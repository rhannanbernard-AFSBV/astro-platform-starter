import { query } from '../db/client.js';

const EARTH_RADIUS_M = 6371000;

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

async function assertBidTenant(tenantId, bidId) {
  const { rows } = await query(
    'SELECT bid_id, client_name, property_address FROM bids WHERE bid_id = $1 AND tenant_id = $2',
    [bidId, tenantId]
  );
  if (!rows.length) {
    throw Object.assign(new Error('Bid not found'), { status: 404 });
  }
  return rows[0];
}

export async function upsertGeofence({
  tenantId,
  bidId,
  centerLat,
  centerLng,
  radiusM = 150,
  label,
}) {
  await assertBidTenant(tenantId, bidId);
  const { rows } = await query(
    `INSERT INTO bid_site_geofences (tenant_id, bid_id, center_lat, center_lng, radius_m, label)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (bid_id) DO UPDATE SET
       center_lat = EXCLUDED.center_lat,
       center_lng = EXCLUDED.center_lng,
       radius_m = EXCLUDED.radius_m,
       label = EXCLUDED.label
     RETURNING *`,
    [
      tenantId,
      bidId,
      Number(centerLat),
      Number(centerLng),
      Number(radiusM) || 150,
      label || null,
    ]
  );
  return rows[0];
}

export async function getGeofence(tenantId, bidId) {
  await assertBidTenant(tenantId, bidId);
  const { rows } = await query(
    'SELECT * FROM bid_site_geofences WHERE bid_id = $1 AND tenant_id = $2',
    [bidId, tenantId]
  );
  return rows[0] || null;
}

/**
 * Clock-in or room completion with lat/lng; evaluates geofence when configured.
 */
export async function logGpsEvent({
  tenantId,
  userId,
  bidId,
  checklistId,
  eventType,
  latitude,
  longitude,
  accuracyM,
  notes,
}) {
  await assertBidTenant(tenantId, bidId);
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw Object.assign(new Error('latitude and longitude are required'), {
      status: 400,
    });
  }
  const allowed = ['clock_in', 'clock_out', 'room_complete', 'heartbeat'];
  if (!allowed.includes(eventType)) {
    throw Object.assign(
      new Error(`event_type must be one of ${allowed.join(', ')}`),
      { status: 400 }
    );
  }

  if (checklistId) {
    const c = await query(
      `SELECT c.checklist_id FROM bid_checklists c
       JOIN bids b ON b.bid_id = c.bid_id
       WHERE c.checklist_id = $1 AND c.bid_id = $2 AND b.tenant_id = $3`,
      [checklistId, bidId, tenantId]
    );
    if (!c.rows.length) {
      throw Object.assign(new Error('Checklist item not found'), { status: 404 });
    }
  }

  const geofence = await getGeofence(tenantId, bidId);
  let within = null;
  if (geofence) {
    const dist = haversineMeters(
      lat,
      lng,
      Number(geofence.center_lat),
      Number(geofence.center_lng)
    );
    within = dist <= Number(geofence.radius_m);
  }

  if (eventType === 'room_complete' && geofence && within === false) {
    await query(
      `INSERT INTO crew_gps_events (
         tenant_id, bid_id, checklist_id, user_id, event_type,
         latitude, longitude, accuracy_m, within_geofence, notes
       ) VALUES ($1,$2,$3,$4,'room_complete_rejected',$5,$6,$7,$8,$9)`,
      [
        tenantId,
        bidId,
        checklistId || null,
        userId || null,
        lat,
        lng,
        accuracyM != null ? Number(accuracyM) : null,
        false,
        notes || 'Outside geofence',
      ]
    );
    throw Object.assign(
      new Error('Room completion rejected — crew is outside the site geofence'),
      { status: 403, geofence_violation: true }
    );
  }

  const ins = await query(
    `INSERT INTO crew_gps_events (
       tenant_id, bid_id, checklist_id, user_id, event_type,
       latitude, longitude, accuracy_m, within_geofence, notes
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      tenantId,
      bidId,
      checklistId || null,
      userId || null,
      eventType,
      lat,
      lng,
      accuracyM != null ? Number(accuracyM) : null,
      within,
      notes || null,
    ]
  );

  if (eventType === 'room_complete' && checklistId) {
    await query(
      `UPDATE bid_checklists
       SET completed_at = CURRENT_TIMESTAMP, completed_lat = $1, completed_lng = $2
       WHERE checklist_id = $3`,
      [lat, lng, checklistId]
    );
  }

  return {
    event: ins.rows[0],
    geofence: geofence
      ? {
          center_lat: Number(geofence.center_lat),
          center_lng: Number(geofence.center_lng),
          radius_m: Number(geofence.radius_m),
          within_geofence: within,
        }
      : null,
  };
}

export async function listGpsEvents(tenantId, bidId) {
  await assertBidTenant(tenantId, bidId);
  const { rows } = await query(
    `SELECT * FROM crew_gps_events
     WHERE bid_id = $1 AND tenant_id = $2
     ORDER BY created_at DESC
     LIMIT 200`,
    [bidId, tenantId]
  );
  return rows;
}
