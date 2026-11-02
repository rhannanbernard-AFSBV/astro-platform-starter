import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { createDefaultState } from './defaults';
import {
    bootstrapPos,
    fetchPosState,
    isServerMode,
    probePosHealth,
    pushPosState,
    type PosSession,
} from './posApi';
import { describeConflict, rebaseLocalOntoRemote } from './syncMerge';
import { saveState, touchState } from './storage';
import type { PersistedState } from './types';
import { usePosEvents } from './usePosEvents';

type Args = {
    hydrated: boolean;
    session: PosSession | null;
    state: PersistedState;
    setState: Dispatch<SetStateAction<PersistedState>>;
    revision: number | null;
    setRevision: (revision: number | null) => void;
};

/**
 * Multi-device sync against the POS API:
 * - debounced push on local edits
 * - poll for remote updates every 2s
 * - SSE nudge for near-realtime board refresh
 * - 409 conflict rebase (keep non-overlapping local checks)
 */
export function usePosServer({
    hydrated,
    session,
    state,
    setState,
    revision,
    setRevision,
}: Args) {
    const [serverOnline, setServerOnline] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [conflictNotice, setConflictNotice] = useState<string | null>(null);
    const pushing = useRef(false);
    const lastPushedAt = useRef(0);
    const stateRef = useRef(state);
    stateRef.current = state;
    const enabled = isServerMode() && Boolean(session);

    const applyRemote = useCallback(
        (remote: { state: PersistedState; revision: number }, mode: 'poll' | 'conflict') => {
            const local = stateRef.current;
            if (mode === 'conflict') {
                const merged = rebaseLocalOntoRemote({
                    local,
                    remote: remote.state,
                    preserveActiveStaffId: session?.staff.id ?? local.activeStaffId,
                });
                lastPushedAt.current = merged.state.updatedAt;
                setRevision(remote.revision);
                setState(touchState(merged.state));
                const message = describeConflict(merged.preservedTableIds);
                setConflictNotice(message);
                setSyncError(message);
                return;
            }
            if (remote.state.updatedAt > local.updatedAt) {
                lastPushedAt.current = remote.state.updatedAt;
                setRevision(remote.revision);
                setState(
                    touchState({
                        ...remote.state,
                        activeStaffId: session?.staff.id ?? remote.state.activeStaffId,
                    }),
                );
            } else {
                setRevision(remote.revision);
            }
        },
        [session, setRevision, setState],
    );

    const reloadFloor = useCallback(async () => {
        if (!enabled) return;
        try {
            const remote = await fetchPosState();
            lastPushedAt.current = remote.state.updatedAt;
            setRevision(remote.revision);
            setState(
                touchState({
                    ...remote.state,
                    activeStaffId: session?.staff.id ?? remote.state.activeStaffId,
                }),
            );
            setConflictNotice(null);
            setSyncError(null);
            setServerOnline(true);
        } catch (err) {
            setSyncError(err instanceof Error ? err.message : 'Reload failed');
        }
    }, [enabled, session, setRevision, setState]);

    useEffect(() => {
        if (!isServerMode()) {
            setServerOnline(false);
            return;
        }
        let cancelled = false;
        const tick = async () => {
            const ok = await probePosHealth();
            if (!cancelled) setServerOnline(ok);
        };
        void tick();
        const id = window.setInterval(tick, 10_000);
        return () => {
            cancelled = true;
            window.clearInterval(id);
        };
    }, []);

    useEffect(() => {
        if (!enabled || !hydrated) return;
        let cancelled = false;
        (async () => {
            try {
                const remote = await fetchPosState();
                if (cancelled) return;
                if (!remote.state.menu?.length) {
                    const seed = createDefaultState();
                    const boot = await bootstrapPos(seed.menu, seed.tables);
                    if (cancelled) return;
                    setRevision(boot.revision);
                    setState(touchState({ ...boot.state, activeStaffId: session!.staff.id }));
                    saveState(boot.state);
                }
            } catch (err) {
                if (!cancelled) {
                    setSyncError(err instanceof Error ? err.message : 'Bootstrap failed');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [enabled, hydrated, session, setRevision, setState]);

    useEffect(() => {
        if (!enabled || !hydrated) return;
        const timer = window.setTimeout(async () => {
            if (pushing.current) return;
            if (state.updatedAt <= lastPushedAt.current) return;
            pushing.current = true;
            try {
                const result = await pushPosState(state, revision);
                lastPushedAt.current = result.state.updatedAt;
                setRevision(result.revision);
                setSyncError(null);
                setConflictNotice(null);
            } catch (err) {
                const status = (err as { status?: number }).status;
                if (status === 409) {
                    try {
                        const remote = await fetchPosState();
                        applyRemote(remote, 'conflict');
                    } catch (pullErr) {
                        setSyncError(
                            pullErr instanceof Error ? pullErr.message : 'Conflict resolve failed',
                        );
                    }
                } else {
                    setSyncError(err instanceof Error ? err.message : 'Push failed');
                }
            } finally {
                pushing.current = false;
            }
        }, 500);
        return () => window.clearTimeout(timer);
    }, [enabled, hydrated, state, revision, applyRemote, setRevision]);

    useEffect(() => {
        if (!enabled || !hydrated) return;
        const id = window.setInterval(async () => {
            if (pushing.current) return;
            try {
                const remote = await fetchPosState();
                applyRemote(remote, 'poll');
                setServerOnline(true);
            } catch {
                setServerOnline(false);
            }
        }, 2000);
        return () => window.clearInterval(id);
    }, [enabled, hydrated, applyRemote]);

    usePosEvents({
        enabled: Boolean(enabled && hydrated),
        onEvent: () => {
            if (pushing.current) return;
            void fetchPosState()
                .then((remote) => {
                    applyRemote(remote, 'poll');
                    setServerOnline(true);
                })
                .catch(() => {
                    /* poll will retry */
                });
        },
    });

    return {
        serverMode: isServerMode(),
        serverOnline,
        syncError,
        conflictNotice,
        clearConflictNotice: () => setConflictNotice(null),
        reloadFloor,
        enabled,
    };
}
