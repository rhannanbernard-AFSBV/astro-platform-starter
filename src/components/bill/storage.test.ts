import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { createDefaultState } from './defaults';

// Exercise normalize via load path by importing internal behavior through createDefaultState + roundtrip shape
describe('persisted state v5', () => {
    it('defaults include settings and updatedAt', () => {
        const state = createDefaultState();
        expect(state.version).toBe(5);
        expect(state.settings.xcgPerUsd).toBe(DEFAULT_SETTINGS.xcgPerUsd);
        expect(typeof state.updatedAt).toBe('number');
        expect(state.settings.shiftOpenedAt).toBeTruthy();
    });
});
