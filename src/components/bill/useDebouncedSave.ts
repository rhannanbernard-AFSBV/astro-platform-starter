import { useEffect, useRef } from 'react';
import { saveState } from './storage';
import type { PersistedState } from './types';

export function useDebouncedSave(state: PersistedState, enabled: boolean, delayMs = 400) {
    const latest = useRef(state);
    latest.current = state;

    useEffect(() => {
        if (!enabled) return;
        const timer = window.setTimeout(() => {
            saveState(latest.current);
        }, delayMs);
        return () => window.clearTimeout(timer);
    }, [state, enabled, delayMs]);

    useEffect(() => {
        if (!enabled) return;
        const flush = () => saveState(latest.current);
        window.addEventListener('beforeunload', flush);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flush();
        });
        return () => {
            window.removeEventListener('beforeunload', flush);
            flush();
        };
    }, [enabled]);
}
