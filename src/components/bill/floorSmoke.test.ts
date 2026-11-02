import { describe, expect, it } from 'vitest';
import { runFloorSmokeScenario } from './floorSmoke';

describe('floor smoke path', () => {
    it('runs PIN→order→fire→pay→bar tab→reopen→shift close station totals', () => {
        const result = runFloorSmokeScenario(new Date('2026-10-09T18:00:00.000Z'));
        expect(result.ok).toBe(true);
        expect(result.orderNumbers.length).toBeGreaterThan(0);
        expect(result.floorTotalCents).toBeGreaterThan(0);
        expect(result.barTotalCents).toBeGreaterThan(0);
        expect(result.reopenedTabLabel).toMatch(/^Tab · Smoke Guest$/i);
        expect(result.shiftCloseText).toContain('Floor ·');
        expect(result.shiftCloseText).toContain('Bar ·');
        expect(result.shiftCloseText).toContain('Payments stay blocked');
    });
});
