import { query } from '../db/client.js';

/**
 * Stubbed push hooks — register devices and log outbox events.
 * Wire Expo/FCM later by reading push_outbox + push_devices.
 */

export async function registerPushDevice({
  tenantId,
  userId,
  pushToken,
  platform = 'expo',
}) {
  if (!pushToken?.trim()) {
    throw Object.assign(new Error('push_token is required'), { status: 400 });
  }
  const { rows } = await query(
    `INSERT INTO push_devices (tenant_id, user_id, platform, push_token, active)
     VALUES ($1,$2,$3,$4,TRUE)
     ON CONFLICT (tenant_id, push_token) DO UPDATE SET
       active = TRUE,
       user_id = COALESCE(EXCLUDED.user_id, push_devices.user_id),
       platform = EXCLUDED.platform
     RETURNING *`,
    [tenantId, userId || null, platform, pushToken.trim()]
  );
  return rows[0];
}

export async function emitPushStub({
  tenantId,
  bidId,
  eventType,
  payload = {},
}) {
  const devices = await query(
    `SELECT device_id, push_token, platform FROM push_devices
     WHERE tenant_id = $1 AND active = TRUE`,
    [tenantId]
  );

  const { rows } = await query(
    `INSERT INTO push_outbox (tenant_id, bid_id, event_type, payload, status)
     VALUES ($1,$2,$3,$4::jsonb,'stubbed')
     RETURNING *`,
    [
      tenantId,
      bidId || null,
      eventType,
      JSON.stringify({
        ...payload,
        device_count: devices.rows.length,
        tokens: devices.rows.map((d) => d.push_token.slice(0, 12) + '…'),
      }),
    ]
  );

  console.log(
    `[push:stub] tenant=${tenantId} event=${eventType} devices=${devices.rows.length} bid=${bidId || '-'}`
  );

  return {
    push_id: rows[0].push_id,
    status: 'stubbed',
    devices_targeted: devices.rows.length,
    event_type: eventType,
  };
}

export async function notifyNewChecklist(tenantId, bidId, checklistCount) {
  return emitPushStub({
    tenantId,
    bidId,
    eventType: 'checklist.created',
    payload: {
      title: 'New crew checklist ready',
      body: `${checklistCount} zones sequenced for bid #${bidId}`,
      bid_id: bidId,
    },
  });
}
