import type { PosSettings, StaffRole } from './types';

/** Peak-service bump threshold when Rush mode is on (minutes in queued). */
export const RUSH_BUMP_MINUTES_DEFAULT = 4;

/** Kitchen wait model — minutes per active prep unit. */
export const NORMAL_MINUTES_PER_UNIT = 3.5;
export const RUSH_MINUTES_PER_UNIT = 2.2;
export const NORMAL_WAIT_FLOOR = 8;
export const RUSH_WAIT_FLOOR = 5;
export const NORMAL_WAIT_CEILING = 45;
export const RUSH_WAIT_CEILING = 28;

export function canToggleRushMode(role: StaffRole): boolean {
    return role === 'manager' || role === 'admin' || role === 'server' || role === 'bartender';
}

export function rushBumpMinutes(settings: Pick<PosSettings, 'rushBumpMinutes'>): number {
    return Math.max(1, Math.min(30, settings.rushBumpMinutes || RUSH_BUMP_MINUTES_DEFAULT));
}

/** Effective kitchen bump timer — shorter during Rush mode. */
export function effectiveBumpAfterMinutes(
    settings: Pick<PosSettings, 'bumpAfterMinutes' | 'rushMode' | 'rushBumpMinutes'>,
): number {
    const normal = Math.max(1, settings.bumpAfterMinutes || 8);
    if (!settings.rushMode) return normal;
    return Math.min(normal, rushBumpMinutes(settings));
}

export type KitchenWaitEstimate = {
    activeTickets: number;
    estimatedWaitMinutes: number;
    label: string;
    rushMode: boolean;
};

export function estimateKitchenWait(
    activeTickets: number,
    rushMode: boolean,
): KitchenWaitEstimate {
    const active = Math.max(0, Math.floor(activeTickets));
    const perUnit = rushMode ? RUSH_MINUTES_PER_UNIT : NORMAL_MINUTES_PER_UNIT;
    const floor = rushMode ? RUSH_WAIT_FLOOR : NORMAL_WAIT_FLOOR;
    const ceiling = rushMode ? RUSH_WAIT_CEILING : NORMAL_WAIT_CEILING;
    const minutes =
        active === 0 ? floor : Math.min(ceiling, Math.max(floor, Math.round(active * perUnit)));
    const label = rushMode
        ? active === 0
            ? `Rush · about ${floor} min`
            : `Rush · about ${minutes} min`
        : active === 0
          ? `About ${floor}–${floor + 4} min`
          : `About ${minutes} min`;
    return {
        activeTickets: active,
        estimatedWaitMinutes: minutes,
        label,
        rushMode,
    };
}

export function rushBannerCopy(sinceIso: string | null): string {
    if (!sinceIso) return 'Rush mode on — kitchen & bar are in peak tempo.';
    try {
        const started = new Date(sinceIso);
        const mins = Math.max(0, Math.round((Date.now() - started.getTime()) / 60_000));
        if (mins < 2) return 'Rush mode just went live — peak tempo.';
        return `Rush mode · ${mins} min — peak tempo for kitchen & bar.`;
    } catch {
        return 'Rush mode on — kitchen & bar are in peak tempo.';
    }
}
