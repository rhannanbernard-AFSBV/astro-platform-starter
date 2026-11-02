import { useEffect, useRef } from 'react';
import { getStoredToken, isServerMode } from './posApi';

function eventsUrl(): string | null {
    const raw =
        (import.meta as ImportMeta & { env?: Record<string, string> }).env
            ?.PUBLIC_POS_API_URL ??
        (typeof window !== 'undefined'
            ? (window as unknown as { __POS_API_URL__?: string }).__POS_API_URL__
            : undefined);
    if (!raw) return null;
    return `${String(raw).replace(/\/$/, '')}/pos/events`;
}

/**
 * Subscribe to server-sent POS events so kitchen/bar boards refresh
 * immediately instead of waiting for the 2s poll alone.
 */
export function usePosEvents(options: {
    enabled: boolean;
    onEvent: (payload: { type: string; revision?: number }) => void;
}) {
    const { enabled, onEvent } = options;
    const handler = useRef(onEvent);
    handler.current = onEvent;

    useEffect(() => {
        if (!enabled || !isServerMode()) return;
        const base = eventsUrl();
        const token = getStoredToken();
        if (!base || !token) return;

        // EventSource cannot set Authorization headers — token as query is acceptable
        // for short-lived station sessions on a trusted LAN / HTTPS deploy.
        const url = `${base}?access_token=${encodeURIComponent(token)}`;
        let source: EventSource;
        try {
            source = new EventSource(url);
        } catch {
            return;
        }

        const onMessage = (event: MessageEvent) => {
            try {
                const data = JSON.parse(String(event.data || '{}')) as {
                    type?: string;
                    revision?: number;
                };
                handler.current({
                    type: data.type ?? 'tick',
                    revision: data.revision,
                });
            } catch {
                handler.current({ type: 'tick' });
            }
        };
        source.addEventListener('pos', onMessage);
        source.onmessage = onMessage;

        return () => {
            source.close();
        };
    }, [enabled]);
}
