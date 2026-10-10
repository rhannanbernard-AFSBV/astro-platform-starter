import { describe, expect, it } from 'vitest';
import {
    canToggleRushMode,
    effectiveBumpAfterMinutes,
    estimateKitchenWait,
    rushBannerCopy,
} from './rushMode';

describe('rushMode', () => {
    it('allows floor leads to toggle', () => {
        expect(canToggleRushMode('manager')).toBe(true);
        expect(canToggleRushMode('server')).toBe(true);
        expect(canToggleRushMode('kitchen')).toBe(false);
    });

    it('shortens bump minutes when rush is on', () => {
        expect(
            effectiveBumpAfterMinutes({
                bumpAfterMinutes: 8,
                rushMode: false,
                rushBumpMinutes: 4,
            }),
        ).toBe(8);
        expect(
            effectiveBumpAfterMinutes({
                bumpAfterMinutes: 8,
                rushMode: true,
                rushBumpMinutes: 4,
            }),
        ).toBe(4);
    });

    it('estimates faster guest waits in rush', () => {
        const calm = estimateKitchenWait(6, false);
        const rush = estimateKitchenWait(6, true);
        expect(rush.estimatedWaitMinutes).toBeLessThan(calm.estimatedWaitMinutes);
        expect(rush.label.toLowerCase()).toContain('rush');
    });

    it('builds banner copy', () => {
        expect(rushBannerCopy(null).toLowerCase()).toContain('rush');
    });
});
