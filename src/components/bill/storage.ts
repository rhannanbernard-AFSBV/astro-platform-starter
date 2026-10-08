import {
    createDefaultState,
    createId,
    DEFAULT_MENU,
    DEFAULT_RESTAURANT,
    STAFF_USERS,
    STORAGE_KEY,
} from './defaults';
import type { MenuItem, OrderLine, PersistedState, TableOrder } from './types';

const LEGACY_KEY = 'savory-bill-generator-v1';

function withModifiers(menu: MenuItem[]): MenuItem[] {
    const defaults = new Map(DEFAULT_MENU.map((item) => [item.id, item]));
    return menu.map((item) => ({
        ...item,
        modifierGroups: item.modifierGroups?.length
            ? item.modifierGroups
            : defaults.get(item.id)?.modifierGroups ?? [],
    }));
}

function migrateLegacyLines(lines: Array<Record<string, unknown>>): OrderLine[] {
    return lines.map((line) => ({
        id: typeof line.id === 'string' ? line.id : createId('line'),
        menuItemId: String(line.menuItemId ?? ''),
        quantity: Number(line.quantity ?? 1),
        guestId: (line.guestId as string | null) ?? null,
        note: typeof line.note === 'string' ? line.note : '',
        modifiers: Array.isArray(line.modifiers) ? (line.modifiers as OrderLine['modifiers']) : [],
        kitchenStatus:
            line.kitchenStatus === 'queued' ||
            line.kitchenStatus === 'preparing' ||
            line.kitchenStatus === 'ready' ||
            line.kitchenStatus === 'served' ||
            line.kitchenStatus === 'draft'
                ? line.kitchenStatus
                : 'draft',
        sentToKitchenAt: typeof line.sentToKitchenAt === 'string' ? line.sentToKitchenAt : null,
    }));
}

function migrateTables(tables: Array<Record<string, unknown>>): TableOrder[] {
    return tables.map((table) => ({
        id: String(table.id),
        label: String(table.label ?? 'Table'),
        status: table.status === 'paid' ? 'paid' : 'open',
        lines: migrateLegacyLines(Array.isArray(table.lines) ? (table.lines as Array<Record<string, unknown>>) : []),
        guests: Array.isArray(table.guests) ? (table.guests as TableOrder['guests']) : [],
        tipPreset: (table.tipPreset as TableOrder['tipPreset']) ?? 15,
        tipCustomPercent: Number(table.tipCustomPercent ?? 15),
        taxEnabled: table.taxEnabled !== false,
        taxPercent: Number(table.taxPercent ?? 5),
        billGeneratedAt: typeof table.billGeneratedAt === 'string' ? table.billGeneratedAt : null,
        paidAt: typeof table.paidAt === 'string' ? table.paidAt : null,
        payment: (table.payment as TableOrder['payment']) ?? null,
    }));
}

function normalizeState(value: unknown): PersistedState | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (!Array.isArray(raw.menu) || !Array.isArray(raw.tables) || raw.tables.length === 0) return null;

    const tables = migrateTables(raw.tables as Array<Record<string, unknown>>);
    const activeTableId =
        typeof raw.activeTableId === 'string' && tables.some((table) => table.id === raw.activeTableId)
            ? raw.activeTableId
            : tables[0].id;

    return {
        version: 2,
        menu: withModifiers(raw.menu as MenuItem[]),
        tables,
        activeTableId,
        sales: Array.isArray(raw.sales) ? (raw.sales as PersistedState['sales']) : [],
        restaurant:
            raw.restaurant && typeof raw.restaurant === 'object'
                ? { ...DEFAULT_RESTAURANT, ...(raw.restaurant as PersistedState['restaurant']) }
                : DEFAULT_RESTAURANT,
        activeStaffId:
            typeof raw.activeStaffId === 'string' &&
            STAFF_USERS.some((staff) => staff.id === raw.activeStaffId)
                ? raw.activeStaffId
                : STAFF_USERS[0].id,
    };
}

export function loadState(): PersistedState {
    if (typeof window === 'undefined') return createDefaultState();
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_KEY);
        if (!raw) return createDefaultState();
        const parsed = normalizeState(JSON.parse(raw));
        if (!parsed) return createDefaultState();
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        return parsed;
    } catch {
        return createDefaultState();
    }
}

export function saveState(state: PersistedState) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function findStaffByPin(pin: string) {
    return STAFF_USERS.find((staff) => staff.pin === pin) ?? null;
}
