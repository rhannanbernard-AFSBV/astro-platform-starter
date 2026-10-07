import { createDefaultState, STORAGE_KEY } from './defaults';
import type { PersistedState } from './types';

function isValidState(value: unknown): value is PersistedState {
    if (!value || typeof value !== 'object') return false;
    const state = value as PersistedState;
    return (
        state.version === 1 &&
        Array.isArray(state.menu) &&
        Array.isArray(state.tables) &&
        typeof state.activeTableId === 'string'
    );
}

export function loadState(): PersistedState {
    if (typeof window === 'undefined') return createDefaultState();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return createDefaultState();
        const parsed = JSON.parse(raw) as unknown;
        if (!isValidState(parsed) || parsed.tables.length === 0) return createDefaultState();
        if (!parsed.tables.some((table) => table.id === parsed.activeTableId)) {
            parsed.activeTableId = parsed.tables[0].id;
        }
        return parsed;
    } catch {
        return createDefaultState();
    }
}

export function saveState(state: PersistedState) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
