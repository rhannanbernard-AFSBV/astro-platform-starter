import { createId } from './defaults';
import { formatOrderNumber } from './math';
import { isBeverageItem, isKitchenBoundItem } from './statusUi';
import type {
    AppNotification,
    KitchenStatus,
    MenuItem,
    PersistedState,
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

export function queueDraftBeverages(
    table: TableOrder,
    menuById: Map<string, MenuItem>,
    staffId: string,
): TableOrder {
    let changed = false;
    const lines = table.lines.map((line) => {
        if (line.kitchenStatus !== 'draft') return line;
        if (!isBeverageItem(menuById.get(line.menuItemId))) return line;
        changed = true;
        return {
            ...line,
            kitchenStatus: 'queued' as const,
            sentToKitchenAt: null,
            sentByStaffId: staffId,
        };
    });
    return changed ? { ...table, lines } : table;
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
            message: `Your food ticket ${orderNumber} for ${table.label} was sent for prep. Beverages stay with the server.`,
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

export function canGuestTakePayment(table: TableOrder): boolean {
    return Boolean(table.guestBillApprovedAt && table.guestPreferredPayment);
}

export function nextBeverageStatus(status: KitchenStatus): KitchenStatus | null {
    if (status === 'queued') return 'preparing';
    if (status === 'preparing') return 'ready';
    if (status === 'ready') return 'served';
    return null;
}

export function tableStatusTone(table: TableOrder): 'paid' | 'ready' | 'prep' | 'open' {
    if (table.status === 'paid') return 'paid';
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
