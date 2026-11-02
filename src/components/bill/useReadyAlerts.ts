import { useEffect, useRef, useState } from 'react';
import { collectReadyFoodLines } from './posLogic';
import type { MenuItem, TableOrder } from './types';

function playReadyChime() {
    try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
        window.setTimeout(() => void ctx.close(), 400);
    } catch {
        /* audio optional */
    }
}

export function useReadyAlerts(
    tables: TableOrder[],
    menuById: Map<string, MenuItem>,
    enabled: boolean,
) {
    const seen = useRef(new Set<string>());
    const [flashIds, setFlashIds] = useState<string[]>([]);
    const [banner, setBanner] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const ready = collectReadyFoodLines(tables, menuById);
        const fresh = ready.filter((entry) => !seen.current.has(entry.lineId));
        for (const entry of ready) seen.current.add(entry.lineId);

        // Drop ids no longer ready
        const readyIds = new Set(ready.map((entry) => entry.lineId));
        for (const id of [...seen.current]) {
            if (!readyIds.has(id)) seen.current.delete(id);
        }

        if (fresh.length === 0) return;

        playReadyChime();
        const ids = fresh.map((entry) => entry.lineId);
        setFlashIds(ids);
        setBanner(
            fresh.length === 1
                ? `${fresh[0].tableLabel}: ${fresh[0].name} is ready`
                : `${fresh.length} items ready for pickup`,
        );
        const timer = window.setTimeout(() => {
            setFlashIds([]);
            setBanner(null);
        }, 4500);
        return () => window.clearTimeout(timer);
    }, [tables, menuById, enabled]);

    return { flashIds, banner };
}
