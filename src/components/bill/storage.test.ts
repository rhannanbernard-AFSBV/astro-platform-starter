import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, createDefaultState } from './defaults';

describe('persisted state v6', () => {
    it('defaults include settings, audit log, and updatedAt', () => {
        const state = createDefaultState();
        expect(state.version).toBe(6);
        expect(state.settings.xcgPerUsd).toBe(DEFAULT_SETTINGS.xcgPerUsd);
        expect(state.settings.bumpAfterMinutes).toBe(DEFAULT_SETTINGS.bumpAfterMinutes);
        expect(typeof state.updatedAt).toBe('number');
        expect(state.settings.shiftOpenedAt).toBeTruthy();
        expect(state.auditLog).toEqual([]);
        expect(state.menu[0].image).toMatch(/^\/menu\//);
        expect(state.tables[0].lines[0].courseFire).toBe('fire');
        expect(state.tables[0].guests[0].paidAt).toBeNull();
    });
});
