import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { STORAGE_KEY } from './defaults';
import { saveState } from './storage';
import type { PersistedState } from './types';

const CHANNEL_NAME = 'savory-pos-sync-v1';

type SyncMessage = {
    type: 'state';
    originId: string;
    updatedAt: number;
    state: PersistedState;
};

function tabId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    return `tab_${Math.random().toString(36).slice(2)}`;
}

/**
 * Cross-tab sync so one browser tab can run Kitchen while another runs Service.
 * Last-write-wins using message timestamps.
 */
export function usePosSync(
    state: PersistedState,
    setState: Dispatch<SetStateAction<PersistedState>>,
    enabled: boolean,
) {
    const originId = useRef(tabId());
    const applyingRemote = useRef(false);
    const latestAppliedAt = useRef(0);
    const hydrated = useRef(false);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        const applyRemote = (remote: PersistedState, stamp: number) => {
            if (stamp <= latestAppliedAt.current) return;
            applyingRemote.current = true;
            latestAppliedAt.current = stamp;
            setState(remote);
            saveState(remote);
            queueMicrotask(() => {
                applyingRemote.current = false;
            });
        };

        let channel: BroadcastChannel | null = null;
        if (typeof BroadcastChannel !== 'undefined') {
            channel = new BroadcastChannel(CHANNEL_NAME);
            channel.onmessage = (event: MessageEvent<SyncMessage>) => {
                const message = event.data;
                if (!message || message.type !== 'state') return;
                if (message.originId === originId.current) return;
                applyRemote(message.state, message.updatedAt);
            };
        }

        const onStorage = (event: StorageEvent) => {
            if (event.key !== STORAGE_KEY && !event.key?.startsWith('savory-bill-generator')) {
                return;
            }
            if (!event.newValue) return;
            try {
                const parsed = JSON.parse(event.newValue) as PersistedState;
                applyRemote(parsed, parsed.updatedAt ?? Date.now());
            } catch {
                /* ignore */
            }
        };

        window.addEventListener('storage', onStorage);
        hydrated.current = true;
        return () => {
            channel?.close();
            window.removeEventListener('storage', onStorage);
        };
    }, [enabled, setState]);

    useEffect(() => {
        if (!enabled || !hydrated.current || applyingRemote.current) return;
        if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

        const stamp = Date.now();
        latestAppliedAt.current = Math.max(latestAppliedAt.current, stamp);
        const channel = new BroadcastChannel(CHANNEL_NAME);
        channel.postMessage({
            type: 'state',
            originId: originId.current,
            updatedAt: stamp,
            state: { ...state, updatedAt: stamp },
        } satisfies SyncMessage);
        channel.close();
    }, [state, enabled]);
}
