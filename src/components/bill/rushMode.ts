import rushWait from '../../../shared/rush-wait.json';
import { createId } from './defaults';
import type {
    AppNotification,
    AuditEntry,
    PersistedState,
    PosSettings,
    SaleRecord,
    StaffRole,
    StaffUser,
} from './types';

export const RUSH_BUMP_MINUTES_DEFAULT = rushWait.defaultRushBumpMinutes;
export const NORMAL_MINUTES_PER_UNIT = rushWait.normalMinutesPerUnit;
export const RUSH_MINUTES_PER_UNIT = rushWait.rushMinutesPerUnit;
export const NORMAL_WAIT_FLOOR = rushWait.normalWaitFloor;
export const RUSH_WAIT_FLOOR = rushWait.rushWaitFloor;
export const NORMAL_WAIT_CEILING = rushWait.normalWaitCeiling;
export const RUSH_WAIT_CEILING = rushWait.rushWaitCeiling;
export const RUSH_AUTO_OFF_DEFAULT = rushWait.defaultAutoOffMinutes;
export const RUSH_WARN_DEFAULT = rushWait.defaultWarnMinutes;

export type RushSession = {
    startedAt: string;
    endedAt: string | null;
};

export function canToggleRushMode(
    role: StaffRole,
    settings: Pick<PosSettings, 'rushManagerOnly'>,
): boolean {
    if (settings.rushManagerOnly) {
        return role === 'manager' || role === 'admin';
    }
    return role === 'manager' || role === 'admin' || role === 'server' || role === 'bartender';
}

export function rushBumpMinutes(settings: Pick<PosSettings, 'rushBumpMinutes'>): number {
    return Math.max(1, Math.min(30, settings.rushBumpMinutes || RUSH_BUMP_MINUTES_DEFAULT));
}

export function rushAutoOffMinutes(settings: Pick<PosSettings, 'rushAutoOffMinutes'>): number {
    return Math.max(0, Math.min(24 * 60, settings.rushAutoOffMinutes ?? RUSH_AUTO_OFF_DEFAULT));
}

export function rushWarnMinutes(settings: Pick<PosSettings, 'rushWarnMinutes'>): number {
    return Math.max(1, Math.min(120, settings.rushWarnMinutes ?? RUSH_WARN_DEFAULT));
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

export function rushMinutesRemaining(
    settings: Pick<PosSettings, 'rushMode' | 'rushModeSince' | 'rushAutoOffMinutes'>,
    nowMs = Date.now(),
): number | null {
    if (!settings.rushMode || !settings.rushModeSince) return null;
    const autoOff = rushAutoOffMinutes(settings);
    if (autoOff <= 0) return null;
    const started = new Date(settings.rushModeSince).getTime();
    if (Number.isNaN(started)) return null;
    const ends = started + autoOff * 60_000;
    return Math.max(0, Math.ceil((ends - nowMs) / 60_000));
}

export function shouldAutoOffRush(
    settings: Pick<PosSettings, 'rushMode' | 'rushModeSince' | 'rushAutoOffMinutes'>,
    nowMs = Date.now(),
): boolean {
    const remaining = rushMinutesRemaining(settings, nowMs);
    return remaining === 0;
}

export function shouldWarnRushEnding(
    settings: Pick<
        PosSettings,
        'rushMode' | 'rushModeSince' | 'rushAutoOffMinutes' | 'rushWarnMinutes'
    >,
    nowMs = Date.now(),
): boolean {
    const remaining = rushMinutesRemaining(settings, nowMs);
    if (remaining === null) return false;
    return remaining > 0 && remaining <= rushWarnMinutes(settings);
}

function closeOpenSessions(sessions: RushSession[], endedAt: string): RushSession[] {
    return sessions.map((session) =>
        session.endedAt ? session : { ...session, endedAt },
    );
}

function rushNotifications(turningOn: boolean, createdAt: string): AppNotification[] {
    const title = turningOn ? 'Rush mode on' : 'Rush mode off';
    const message = turningOn
        ? 'Peak tempo — bumps escalate sooner. Keep tickets moving.'
        : 'Back to normal tempo.';
    return [
        {
            id: createId('notif'),
            kind: 'rush_alert',
            title,
            message,
            orderNumber: null,
            tableLabel: null,
            audienceRole: 'kitchen',
            targetStaffId: null,
            createdAt,
            readBy: [],
        },
        {
            id: createId('notif'),
            kind: 'rush_alert',
            title,
            message,
            orderNumber: null,
            tableLabel: null,
            audienceRole: 'bartender',
            targetStaffId: null,
            createdAt,
            readBy: [],
        },
    ];
}

export type ToggleRushOptions = {
    turningOn: boolean;
    staff: Pick<StaffUser, 'id' | 'name' | 'role'>;
    reason?: string;
    nowIso?: string;
};

/** Apply rush on/off: settings, sessions, audit, kitchen/bar alerts. */
export function applyToggleRushMode(
    state: PersistedState,
    options: ToggleRushOptions,
): PersistedState {
    const nowIso = options.nowIso ?? new Date().toISOString();
    const sessions = [...(state.settings.rushSessions ?? [])];
    let nextSessions: RushSession[];
    if (options.turningOn) {
        nextSessions = [...closeOpenSessions(sessions, nowIso), { startedAt: nowIso, endedAt: null }];
    } else {
        nextSessions = closeOpenSessions(sessions, nowIso);
    }

    const audit: AuditEntry = {
        id: createId('audit'),
        kind: 'rush_mode',
        reason: options.reason ?? (options.turningOn ? 'Rush mode on' : 'Rush mode off'),
        staffId: options.staff.id,
        staffName: options.staff.name,
        createdAt: nowIso,
        details: options.turningOn
            ? `Rush on · bump ${rushBumpMinutes(state.settings)} min · auto-off ${rushAutoOffMinutes(state.settings) || 'off'} min`
            : 'Rush off · normal tempo restored',
        tableLabel: null,
    };

    const notifications = [
        ...rushNotifications(options.turningOn, nowIso),
        ...state.notifications,
    ].slice(0, 200);

    return {
        ...state,
        settings: {
            ...state.settings,
            rushMode: options.turningOn,
            rushModeSince: options.turningOn ? nowIso : null,
            rushSessions: nextSessions.slice(-40),
        },
        auditLog: [audit, ...state.auditLog].slice(0, 200),
        notifications,
        updatedAt: Date.now(),
    };
}

export function totalRushMinutes(
    sessions: RushSession[],
    nowMs = Date.now(),
): number {
    let total = 0;
    for (const session of sessions) {
        const start = new Date(session.startedAt).getTime();
        if (Number.isNaN(start)) continue;
        const end = session.endedAt ? new Date(session.endedAt).getTime() : nowMs;
        if (Number.isNaN(end) || end <= start) continue;
        total += (end - start) / 60_000;
    }
    return Math.round(total);
}

function paidDuringRush(sale: SaleRecord, sessions: RushSession[]): boolean {
    const paid = new Date(sale.paidAt).getTime();
    if (Number.isNaN(paid)) return false;
    return sessions.some((session) => {
        const start = new Date(session.startedAt).getTime();
        const end = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
        return !Number.isNaN(start) && !Number.isNaN(end) && paid >= start && paid <= end;
    });
}

export function summarizeRushShift(
    sales: SaleRecord[],
    sessions: RushSession[],
    nowMs = Date.now(),
) {
    const rushSales = sales.filter((sale) => paidDuringRush(sale, sessions));
    const totalCents = rushSales.reduce((sum, sale) => sum + sale.totalCents, 0);
    const tipCents = rushSales.reduce((sum, sale) => sum + sale.tipCents, 0);
    return {
        minutes: totalRushMinutes(sessions, nowMs),
        checkCount: rushSales.length,
        totalCents,
        tipCents,
    };
}

export function formatRushShiftLine(
    sales: SaleRecord[],
    sessions: RushSession[],
    formatMoney: (cents: number) => string,
): string {
    const rush = summarizeRushShift(sales, sessions);
    if (rush.minutes <= 0 && rush.checkCount === 0) {
        return 'Rush · not used this shift';
    }
    return `Rush · ${rush.minutes} min · Checks ${rush.checkCount} · ${formatMoney(rush.totalCents)} · tips ${formatMoney(rush.tipCents)}`;
}

export function confirmRushToggleMessage(turningOn: boolean, settings: PosSettings): string {
    if (turningOn) {
        const auto = rushAutoOffMinutes(settings);
        return [
            'Turn on Rush mode?',
            '',
            `Kitchen bumps escalate at ${rushBumpMinutes(settings)} min.`,
            'Guest wait estimates speed up.',
            auto > 0
                ? `Auto-off after ${auto} min (warning at ${rushWarnMinutes(settings)} min left).`
                : 'Auto-off is disabled.',
        ].join('\n');
    }
    return 'Turn off Rush mode and return to normal tempo?';
}
