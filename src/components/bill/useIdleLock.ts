import { useEffect, useRef, useState } from 'react';

type Options = {
    enabled: boolean;
    idleMinutes: number;
    onLock?: () => void;
};

/**
 * Locks the POS UI after `idleMinutes` without pointer/keyboard/touch activity.
 * Call `bump()` after a successful unlock to restart the timer.
 */
export function useIdleLock({ enabled, idleMinutes, onLock }: Options) {
    const [locked, setLocked] = useState(false);
    const timerRef = useRef<number | null>(null);
    const onLockRef = useRef(onLock);
    onLockRef.current = onLock;

    const clearTimer = () => {
        if (timerRef.current != null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const arm = () => {
        clearTimer();
        if (!enabled || locked || idleMinutes <= 0) return;
        timerRef.current = window.setTimeout(
            () => {
                setLocked(true);
                onLockRef.current?.();
            },
            idleMinutes * 60_000,
        );
    };

    useEffect(() => {
        if (!enabled || idleMinutes <= 0) {
            clearTimer();
            return;
        }
        if (locked) {
            clearTimer();
            return;
        }
        const onActivity = () => arm();
        const events: Array<keyof WindowEventMap> = [
            'pointerdown',
            'keydown',
            'touchstart',
            'mousemove',
            'scroll',
        ];
        events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
        arm();
        return () => {
            events.forEach((event) => window.removeEventListener(event, onActivity));
            clearTimer();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- arm/clear are stable enough via refs
    }, [enabled, idleMinutes, locked]);

    const unlock = () => {
        setLocked(false);
    };

    const lockNow = () => {
        setLocked(true);
        onLockRef.current?.();
    };

    return { locked, unlock, lockNow };
}
