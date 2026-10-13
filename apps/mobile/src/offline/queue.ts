import { Platform } from 'react-native';
import { offlineSync } from '../api/client';

const KEY = 'omniclean_offline_queue';

type QueuedEvent = {
  bid_id: number;
  event: Record<string, unknown>;
  queued_at: string;
};

async function readQueue(): Promise<QueuedEvent[]> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    }
    const SecureStore = await import('expo-secure-store');
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedEvent[]) {
  const raw = JSON.stringify(items);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(KEY, raw);
    return;
  }
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(KEY, raw);
  } catch {
    /* ignore */
  }
}

/** Queue a crew event for later sync (offline complete). */
export async function enqueueOfflineEvent(
  bidId: number,
  event: Record<string, unknown>
) {
  const q = await readQueue();
  q.push({
    bid_id: bidId,
    event,
    queued_at: new Date().toISOString(),
  });
  await writeQueue(q);
  return q.length;
}

export async function pendingCount() {
  return (await readQueue()).length;
}

/** Flush queue grouped by bid_id. */
export async function flushOfflineQueue() {
  const q = await readQueue();
  if (!q.length) return { synced: 0, remaining: 0, batches: [] as unknown[] };

  const byBid = new Map<number, QueuedEvent[]>();
  for (const item of q) {
    if (!byBid.has(item.bid_id)) byBid.set(item.bid_id, []);
    byBid.get(item.bid_id)!.push(item);
  }

  const batches = [];
  const failed: QueuedEvent[] = [];

  for (const [bidId, items] of byBid) {
    try {
      const result = await offlineSync(
        bidId,
        items.map((i) => i.event),
        `mobile-${Date.now()}-${bidId}`
      );
      batches.push(result);
      // Re-queue failed events inside batch
      for (const r of result.results || []) {
        if (!r.ok && items[r.index]) failed.push(items[r.index]);
      }
    } catch {
      failed.push(...items);
    }
  }

  await writeQueue(failed);
  return {
    synced: q.length - failed.length,
    remaining: failed.length,
    batches,
  };
}
