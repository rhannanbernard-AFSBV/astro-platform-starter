import {
    createDefaultState,
    createId,
    DEFAULT_MENU,
    DEFAULT_RESTAURANT,
    DEFAULT_STAFF,
    LEGACY_STORAGE_KEYS,
    STORAGE_KEY,
} from './defaults';
import type { MenuItem, OrderLine, PersistedState, StaffRole, StaffUser, TableOrder } from './types';
import { STAFF_ROLES } from './types';
import { initialsFromName } from './roles';

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
        lines: migrateLegacyLines(
            Array.isArray(table.lines) ? (table.lines as Array<Record<string, unknown>>) : [],
        ),
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

function isStaffRole(value: unknown): value is StaffRole {
    return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

function migrateStaff(rawStaff: unknown, activeStaffId: unknown): StaffUser[] {
    if (!Array.isArray(rawStaff) || rawStaff.length === 0) {
        return DEFAULT_STAFF.map((user) => ({ ...user }));
    }

    const migrated = rawStaff
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const user = entry as Record<string, unknown>;
            const name = String(user.name ?? '').trim();
            const pin = String(user.pin ?? '').trim();
            if (!name || !pin) return null;
            const role: StaffRole = isStaffRole(user.role)
                ? user.role
                : user.role === 'server'
                  ? 'server'
                  : 'server';
            return {
                id: typeof user.id === 'string' ? user.id : createId('staff'),
                name,
                role,
                pin,
                initials:
                    typeof user.initials === 'string' && user.initials
                        ? user.initials
                        : initialsFromName(name),
            } satisfies StaffUser;
        })
        .filter((user): user is StaffUser => Boolean(user));

    if (migrated.length === 0) return DEFAULT_STAFF.map((user) => ({ ...user }));

    // Ensure seed roles exist when upgrading older installs
    for (const seed of DEFAULT_STAFF) {
        if (!migrated.some((user) => user.role === seed.role)) {
            migrated.push({ ...seed });
        }
    }

    if (typeof activeStaffId === 'string' && !migrated.some((user) => user.id === activeStaffId)) {
        // keep list as-is; caller picks fallback active id
    }

    return migrated;
}

function normalizeState(value: unknown): PersistedState | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (!Array.isArray(raw.menu) || !Array.isArray(raw.tables) || raw.tables.length === 0) return null;

    const tables = migrateTables(raw.tables as Array<Record<string, unknown>>);
    const staff = migrateStaff(raw.staff, raw.activeStaffId);
    const activeTableId =
        typeof raw.activeTableId === 'string' && tables.some((table) => table.id === raw.activeTableId)
            ? raw.activeTableId
            : tables[0].id;
    const activeStaffId =
        typeof raw.activeStaffId === 'string' && staff.some((user) => user.id === raw.activeStaffId)
            ? raw.activeStaffId
            : staff[0].id;

    return {
        version: 3,
        menu: withModifiers(raw.menu as MenuItem[]),
        tables,
        activeTableId,
        sales: Array.isArray(raw.sales) ? (raw.sales as PersistedState['sales']) : [],
        restaurant:
            raw.restaurant && typeof raw.restaurant === 'object'
                ? { ...DEFAULT_RESTAURANT, ...(raw.restaurant as PersistedState['restaurant']) }
                : DEFAULT_RESTAURANT,
        staff,
        activeStaffId,
    };
}

function readRawState(): string | null {
    if (typeof window === 'undefined') return null;
    const current = window.localStorage.getItem(STORAGE_KEY);
    if (current) return current;
    for (const key of LEGACY_STORAGE_KEYS) {
        const legacy = window.localStorage.getItem(key);
        if (legacy) return legacy;
    }
    return null;
}

export function loadState(): PersistedState {
    if (typeof window === 'undefined') return createDefaultState();
    try {
        const raw = readRawState();
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

export function findStaffByPin(staff: StaffUser[], pin: string) {
    return staff.find((user) => user.pin === pin) ?? null;
}

export function createStaffUser(input: {
    name: string;
    role: StaffRole;
    pin: string;
}): StaffUser {
    const name = input.name.trim();
    return {
        id: createId('staff'),
        name,
        role: input.role,
        pin: input.pin.trim(),
        initials: initialsFromName(name),
    };
}
