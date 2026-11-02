import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    applyToggleRushMode,
    canToggleRushMode,
    effectiveBumpAfterMinutes,
    estimateKitchenWait,
    NORMAL_MINUTES_PER_UNIT,
    RUSH_MINUTES_PER_UNIT,
    rushBannerCopy,
    shouldAutoOffRush,
    summarizeRushShift,
} from './rushMode';
import { createDefaultState } from './defaults';

const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), 'shared/rush-wait.json'), 'utf8'),
) as {
    normalMinutesPerUnit: number;
    rushMinutesPerUnit: number;
};

describe('rushMode', () => {
    it('matches shared wait constants', () => {
        expect(NORMAL_MINUTES_PER_UNIT).toBe(fixture.normalMinutesPerUnit);
        expect(RUSH_MINUTES_PER_UNIT).toBe(fixture.rushMinutesPerUnit);
    });

    it('respects manager-only policy', () => {
        expect(canToggleRushMode('server', { rushManagerOnly: false })).toBe(true);
        expect(canToggleRushMode('server', { rushManagerOnly: true })).toBe(false);
        expect(canToggleRushMode('manager', { rushManagerOnly: true })).toBe(true);
        expect(canToggleRushMode('kitchen', { rushManagerOnly: false })).toBe(false);
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

    it('applies audit, sessions, and kitchen/bar alerts on toggle', () => {
        const base = createDefaultState();
        const on = applyToggleRushMode(base, {
            turningOn: true,
            staff: { id: 'staff_manager', name: 'Jordan', role: 'manager' },
            nowIso: '2026-10-11T12:00:00.000Z',
        });
        expect(on.settings.rushMode).toBe(true);
        expect(on.settings.rushSessions).toHaveLength(1);
        expect(on.auditLog[0]?.kind).toBe('rush_mode');
        expect(on.notifications.filter((n) => n.kind === 'rush_alert')).toHaveLength(2);

        const off = applyToggleRushMode(on, {
            turningOn: false,
            staff: { id: 'staff_manager', name: 'Jordan', role: 'manager' },
            nowIso: '2026-10-11T13:30:00.000Z',
        });
        expect(off.settings.rushMode).toBe(false);
        expect(off.settings.rushSessions[0]?.endedAt).toBe('2026-10-11T13:30:00.000Z');
        expect(
            summarizeRushShift([], off.settings.rushSessions, Date.parse('2026-10-11T13:30:00.000Z'))
                .minutes,
        ).toBe(90);
    });

    it('auto-offs after configured minutes', () => {
        expect(
            shouldAutoOffRush(
                {
                    rushMode: true,
                    rushModeSince: new Date(Date.now() - 91 * 60_000).toISOString(),
                    rushAutoOffMinutes: 90,
                },
                Date.now(),
            ),
        ).toBe(true);
        expect(
            shouldAutoOffRush(
                {
                    rushMode: true,
                    rushModeSince: new Date(Date.now() - 10 * 60_000).toISOString(),
                    rushAutoOffMinutes: 90,
                },
                Date.now(),
            ),
        ).toBe(false);
    });
});
