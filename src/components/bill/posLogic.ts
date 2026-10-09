import { createId } from './defaults';
import { formatOrderNumber } from './math';
import { isBeverageItem, isKitchenBoundItem } from './statusUi';
import type {
    AppNotification,
    AuditEntry,
    CourseFire,
    KitchenStatus,
    MenuItem,
    PersistedState,
    StaffUser,
    TableOrder,
} from './types';

export function foodDraftLineIds(
    table: TableOrder,
    menuById: Map<string, MenuItem>,
): string[] {
    return table.lines
        .filter(
            (line) =>
                line.kitchenStatus === 'draft' &&
                isKitchenBoundItem(menuById.get(line.menuItemId)),
        )
        .map((line) => line.id);
}

export function drinkDraftLineIds(
    table: TableOrder,
    menuById: Map<string, MenuItem>,
): string[] {
    return table.lines
        .filter(
            (line) =>
                line.kitchenStatus === 'draft' &&
                isBeverageItem(menuById.get(line.menuItemId)),
        )
        .map((line) => line.id);
}

export function applySendFoodToKitchen(
    state: PersistedState,
    menuById: Map<string, MenuItem>,
    sentAt = new Date().toISOString(),
): { state: PersistedState; sentCount: number; orderNumber: string | null } {
    const table = state.tables.find((entry) => entry.id === state.activeTableId);
    if (!table) return { state, sentCount: 0, orderNumber: null };

    const foodIds = new Set(foodDraftLineIds(table, menuById));
    if (foodIds.size === 0) return { state, sentCount: 0, orderNumber: null };

    const orderNumber = formatOrderNumber(state.nextOrderSeq);
    const notifications: AppNotification[] = [
        {
            id: createId('notif'),
            kind: 'kitchen_ticket',
            title: 'New kitchen ticket',
            message: `${table.label} · ${orderNumber} · ${foodIds.size} food item(s) ready for prep`,
            orderNumber,
            tableLabel: table.label,
            audienceRole: 'kitchen',
            targetStaffId: null,
            createdAt: sentAt,
            readBy: [],
        },
        {
            id: createId('notif'),
            kind: 'server_ack',
            title: 'Ticket sent to kitchen',
            message: `Your food ticket ${orderNumber} for ${table.label} was sent for prep. Send drinks to the bar separately.`,
            orderNumber,
            tableLabel: table.label,
            audienceRole: 'server',
            targetStaffId: state.activeStaffId,
            createdAt: sentAt,
            readBy: [],
        },
    ];

    return {
        sentCount: foodIds.size,
        orderNumber,
        state: {
            ...state,
            nextOrderSeq: state.nextOrderSeq + 1,
            updatedAt: Date.now(),
            notifications: [...notifications, ...state.notifications].slice(0, 80),
            tables: state.tables.map((entry) =>
                entry.id !== state.activeTableId
                    ? entry
                    : {
                          ...entry,
                          lines: entry.lines.map((line) =>
                              foodIds.has(line.id)
                                  ? {
                                        ...line,
                                        kitchenStatus: 'queued' as const,
                                        sentToKitchenAt: sentAt,
                                        orderNumber,
                                        sentByStaffId: state.activeStaffId,
                                    }
                                  : line,
                          ),
                      },
            ),
        },
    };
}

/** Fire draft drinks to the bar expo (revenue-critical drink rail). */
export function applySendDrinksToBar(
    state: PersistedState,
    menuById: Map<string, MenuItem>,
    sentAt = new Date().toISOString(),
): { state: PersistedState; sentCount: number; orderNumber: string | null } {
    const table = state.tables.find((entry) => entry.id === state.activeTableId);
    if (!table) return { state, sentCount: 0, orderNumber: null };

    const drinkIds = new Set(drinkDraftLineIds(table, menuById));
    if (drinkIds.size === 0) return { state, sentCount: 0, orderNumber: null };

    const orderNumber = formatOrderNumber(state.nextOrderSeq);
    const notifications: AppNotification[] = [
        {
            id: createId('notif'),
            kind: 'bar_ticket',
            title: 'New bar ticket',
            message: `${table.label} · ${orderNumber} · ${drinkIds.size} drink(s) for the bar`,
            orderNumber,
            tableLabel: table.label,
            audienceRole: 'bartender',
            targetStaffId: null,
            createdAt: sentAt,
            readBy: [],
        },
        {
            id: createId('notif'),
            kind: 'server_ack',
            title: 'Drinks sent to bar',
            message: `Your bar ticket ${orderNumber} for ${table.label} was sent to the bartender.`,
            orderNumber,
            tableLabel: table.label,
            audienceRole: 'server',
            targetStaffId: state.activeStaffId,
            createdAt: sentAt,
            readBy: [],
        },
    ];

    return {
        sentCount: drinkIds.size,
        orderNumber,
        state: {
            ...state,
            nextOrderSeq: state.nextOrderSeq + 1,
            updatedAt: Date.now(),
            notifications: [...notifications, ...state.notifications].slice(0, 80),
            tables: state.tables.map((entry) =>
                entry.id !== state.activeTableId
                    ? entry
                    : {
                          ...entry,
                          lines: entry.lines.map((line) =>
                              drinkIds.has(line.id)
                                  ? {
                                        ...line,
                                        kitchenStatus: 'queued' as const,
                                        sentToKitchenAt: sentAt,
                                        orderNumber,
                                        sentByStaffId: state.activeStaffId,
                                    }
                                  : line,
                          ),
                      },
            ),
        },
    };
}

export function canGuestTakePayment(table: TableOrder): boolean {
    return Boolean(table.guestBillApprovedAt && table.guestPreferredPayment);
}

export function nextBeverageStatus(status: KitchenStatus): KitchenStatus | null {
    if (status === 'queued') return 'preparing';
    if (status === 'preparing') return 'ready';
    if (status === 'ready') return 'served';
    return null;
}

export function tableStatusTone(table: TableOrder): 'paid' | 'partial' | 'ready' | 'prep' | 'open' {
    if (table.status === 'paid') return 'paid';
    if (table.status === 'partial') return 'partial';
    const active = table.lines.filter((line) => line.kitchenStatus !== 'draft');
    if (active.some((line) => line.kitchenStatus === 'ready')) return 'ready';
    if (active.some((line) => line.kitchenStatus === 'preparing' || line.kitchenStatus === 'queued')) {
        return 'prep';
    }
    return 'open';
}

export function collectReadyFoodLines(
    tables: TableOrder[],
    menuById: Map<string, MenuItem>,
): Array<{ tableLabel: string; lineId: string; name: string }> {
    const ready: Array<{ tableLabel: string; lineId: string; name: string }> = [];
    for (const table of tables) {
        for (const line of table.lines) {
            if (line.kitchenStatus !== 'ready') continue;
            const item = menuById.get(line.menuItemId);
            if (!item || isBeverageItem(item)) continue;
            ready.push({
                tableLabel: table.label,
                lineId: line.id,
                name: item.name,
            });
        }
    }
    return ready;
}

/** Minutes a ticket has been waiting in queued/preparing since send (or last bump). */
export function ticketWaitMinutes(
    line: TableOrder['lines'][number],
    now = Date.now(),
): number {
    const anchor = line.bumpedAt ?? line.sentToKitchenAt;
    if (!anchor) return 0;
    return Math.max(0, Math.floor((now - new Date(anchor).getTime()) / 60_000));
}

export function isTicketLate(
    line: TableOrder['lines'][number],
    bumpAfterMinutes: number,
    now = Date.now(),
): boolean {
    if (line.kitchenStatus !== 'queued' && line.kitchenStatus !== 'preparing') return false;
    if (line.courseFire === 'hold') return false;
    return ticketWaitMinutes(line, now) >= bumpAfterMinutes;
}

export function bumpKitchenLine(
    state: PersistedState,
    tableId: string,
    lineId: string,
    staff: StaffUser,
    at = new Date().toISOString(),
): PersistedState {
    const table = state.tables.find((entry) => entry.id === tableId);
    const line = table?.lines.find((entry) => entry.id === lineId);
    if (!table || !line) return state;

    const notification: AppNotification = {
        id: createId('notif'),
        kind: 'bump_alert',
        title: 'Ticket bumped',
        message: `${table.label} · ${line.orderNumber ?? 'ticket'} bumped by ${staff.name}`,
        orderNumber: line.orderNumber,
        tableLabel: table.label,
        audienceRole: staff.role === 'bartender' ? 'bartender' : 'kitchen',
        targetStaffId: null,
        createdAt: at,
        readBy: [],
    };

    return {
        ...state,
        updatedAt: Date.now(),
        notifications: [notification, ...state.notifications].slice(0, 80),
        tables: state.tables.map((entry) =>
            entry.id !== tableId
                ? entry
                : {
                      ...entry,
                      lines: entry.lines.map((row) =>
                          row.id === lineId
                              ? {
                                    ...row,
                                    bumpedAt: at,
                                    bumpCount: row.bumpCount + 1,
                                    courseFire: row.courseFire === 'hold' ? 'fire' : row.courseFire,
                                }
                              : row,
                      ),
                  },
        ),
    };
}

export function recallKitchenLine(
    state: PersistedState,
    tableId: string,
    lineId: string,
): PersistedState {
    return {
        ...state,
        updatedAt: Date.now(),
        tables: state.tables.map((entry) =>
            entry.id !== tableId
                ? entry
                : {
                      ...entry,
                      lines: entry.lines.map((row) =>
                          row.id === lineId && row.kitchenStatus === 'served'
                              ? { ...row, kitchenStatus: 'ready' as const }
                              : row,
                      ),
                  },
        ),
    };
}

export function setLineCourseFire(
    table: TableOrder,
    lineId: string,
    courseFire: CourseFire,
): TableOrder {
    return {
        ...table,
        lines: table.lines.map((line) =>
            line.id === lineId ? { ...line, courseFire } : line,
        ),
    };
}

export function fireHeldLines(table: TableOrder, lineIds?: string[]): TableOrder {
    const ids = lineIds ? new Set(lineIds) : null;
    return {
        ...table,
        lines: table.lines.map((line) => {
            if (line.courseFire !== 'hold') return line;
            if (ids && !ids.has(line.id)) return line;
            if (line.kitchenStatus === 'draft') return line;
            return { ...line, courseFire: 'fire' as const };
        }),
    };
}

export function appendAudit(
    state: PersistedState,
    entry: Omit<AuditEntry, 'id' | 'createdAt'> & { createdAt?: string },
): PersistedState {
    const audit: AuditEntry = {
        id: createId('audit'),
        createdAt: entry.createdAt ?? new Date().toISOString(),
        kind: entry.kind,
        reason: entry.reason,
        staffId: entry.staffId,
        staffName: entry.staffName,
        details: entry.details,
        tableLabel: entry.tableLabel,
    };
    return {
        ...state,
        auditLog: [audit, ...state.auditLog].slice(0, 200),
        updatedAt: Date.now(),
    };
}

export function unpaidGuests(table: TableOrder) {
    return table.guests.filter((guest) => !guest.paidAt);
}

export function allGuestsPaid(table: TableOrder): boolean {
    const spenders = table.guests.filter((guest) =>
        table.lines.some((line) => line.guestId === guest.id),
    );
    if (spenders.length === 0) return Boolean(table.payment);
    return spenders.every((guest) => Boolean(guest.paidAt));
}

export type StationKey = 'service' | 'kitchen' | 'bar' | 'reports' | 'admin' | 'users';

export function parseStationParam(value: string | null | undefined): StationKey | null {
    if (!value) return null;
    const key = value.trim().toLowerCase();
    if (
        key === 'service' ||
        key === 'kitchen' ||
        key === 'bar' ||
        key === 'reports' ||
        key === 'admin' ||
        key === 'users'
    ) {
        return key;
    }
    if (key === 'floor' || key === 'pos') return 'service';
    if (key === 'expo' || key === 'kds') return 'kitchen';
    if (key === 'drinks' || key === 'beverage' || key === 'bartender') return 'bar';
    if (key === 'sales') return 'reports';
    if (key === 'menu') return 'admin';
    return null;
}

export function stationDeepLink(station: StationKey, origin?: string): string {
    const base =
        origin ??
        (typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : '/');
    return `${base}?station=${station}`;
}
