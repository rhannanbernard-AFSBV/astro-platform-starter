import {
    createDefaultState,
    createId,
    DEFAULT_MENU,
    DEFAULT_RESTAURANT,
    DEFAULT_SERVICE_CHARGE_PERCENT,
    DEFAULT_STAFF,
    LEGACY_STORAGE_KEYS,
    STORAGE_KEY,
} from './defaults';
import type {
    AppNotification,
    MenuItem,
    OrderLine,
    PersistedState,
    SaleRecord,
    StaffRole,
    StaffUser,
    TableOrder,
    TipAmountPreset,
} from './types';
import { STAFF_ROLES, TIP_AMOUNT_PRESETS } from './types';
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
        orderNumber: typeof line.orderNumber === 'string' ? line.orderNumber : null,
        sentByStaffId: typeof line.sentByStaffId === 'string' ? line.sentByStaffId : null,
    }));
}

function migrateTipFields(table: Record<string, unknown>): {
    tipAmountPreset: TipAmountPreset;
    tipCents: number;
} {
    if (typeof table.tipCents === 'number' || table.tipAmountPreset !== undefined) {
        const preset = table.tipAmountPreset;
        if (preset === 'custom') {
            return { tipAmountPreset: 'custom', tipCents: Math.max(0, Number(table.tipCents ?? 0)) };
        }
        if (
            typeof preset === 'number' &&
            (TIP_AMOUNT_PRESETS as readonly number[]).includes(preset)
        ) {
            return { tipAmountPreset: preset as TipAmountPreset, tipCents: preset };
        }
        const tipCents = Math.max(0, Number(table.tipCents ?? 0));
        return { tipAmountPreset: tipCents === 0 ? 0 : 'custom', tipCents };
    }

    // Legacy percent tip → approximate currency tip from a $50 check baseline for migration only
    const legacyPreset = table.tipPreset;
    const percent =
        legacyPreset === 'custom'
            ? Math.max(0, Number(table.tipCustomPercent ?? 0))
            : Math.max(0, Number(legacyPreset ?? 0));
    const tipCents = Math.round(5000 * (percent / 100));
    const match = (TIP_AMOUNT_PRESETS as readonly number[]).find((value) => value === tipCents);
    return match !== undefined
        ? { tipAmountPreset: match, tipCents: match }
        : { tipAmountPreset: tipCents === 0 ? 0 : 'custom', tipCents };
}

function migrateTables(tables: Array<Record<string, unknown>>): TableOrder[] {
    return tables.map((table) => {
        const tip = migrateTipFields(table);
        return {
            id: String(table.id),
            label: String(table.label ?? 'Table'),
            status: table.status === 'paid' ? 'paid' : 'open',
            lines: migrateLegacyLines(
                Array.isArray(table.lines) ? (table.lines as Array<Record<string, unknown>>) : [],
            ),
            guests: Array.isArray(table.guests) ? (table.guests as TableOrder['guests']) : [],
            tipAmountPreset: tip.tipAmountPreset,
            tipCents: tip.tipCents,
            serviceChargeEnabled:
                table.serviceChargeEnabled !== undefined
                    ? table.serviceChargeEnabled !== false
                    : table.taxEnabled !== false,
            serviceChargePercent: Number(
                table.serviceChargePercent ?? table.taxPercent ?? DEFAULT_SERVICE_CHARGE_PERCENT,
            ),
            billGeneratedAt: typeof table.billGeneratedAt === 'string' ? table.billGeneratedAt : null,
            paidAt: typeof table.paidAt === 'string' ? table.paidAt : null,
            payment: (table.payment as TableOrder['payment']) ?? null,
            guestSignatureDataUrl:
                typeof table.guestSignatureDataUrl === 'string' ? table.guestSignatureDataUrl : null,
            guestPreferredPayment:
                table.guestPreferredPayment === 'cash' ||
                table.guestPreferredPayment === 'card' ||
                table.guestPreferredPayment === 'mixed'
                    ? table.guestPreferredPayment
                    : null,
            guestBillApprovedAt:
                typeof table.guestBillApprovedAt === 'string' ? table.guestBillApprovedAt : null,
        };
    });
}

function migrateSales(rawSales: unknown): SaleRecord[] {
    if (!Array.isArray(rawSales)) return [];
    return rawSales.map((entry) => {
        const sale = (entry ?? {}) as Record<string, unknown>;
        return {
            id: typeof sale.id === 'string' ? sale.id : createId('sale'),
            tableId: String(sale.tableId ?? ''),
            tableLabel: String(sale.tableLabel ?? 'Table'),
            paidAt: typeof sale.paidAt === 'string' ? sale.paidAt : new Date().toISOString(),
            subtotalCents: Number(sale.subtotalCents ?? 0),
            serviceChargeCents: Number(sale.serviceChargeCents ?? sale.taxCents ?? 0),
            tipCents: Number(sale.tipCents ?? 0),
            totalCents: Number(sale.totalCents ?? 0),
            payment: sale.payment as SaleRecord['payment'],
            serverName: String(sale.serverName ?? 'Server'),
            itemCount: Number(sale.itemCount ?? 0),
            orderNumbers: Array.isArray(sale.orderNumbers)
                ? (sale.orderNumbers as string[])
                : [],
        };
    });
}

function migrateNotifications(raw: unknown): AppNotification[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const n = entry as Record<string, unknown>;
            return {
                id: typeof n.id === 'string' ? n.id : createId('notif'),
                kind: n.kind === 'server_ack' ? 'server_ack' : 'kitchen_ticket',
                title: String(n.title ?? 'Notification'),
                message: String(n.message ?? ''),
                orderNumber: typeof n.orderNumber === 'string' ? n.orderNumber : null,
                tableLabel: typeof n.tableLabel === 'string' ? n.tableLabel : null,
                audienceRole:
                    n.audienceRole === 'kitchen' ||
                    n.audienceRole === 'server' ||
                    n.audienceRole === 'admin' ||
                    n.audienceRole === 'manager' ||
                    n.audienceRole === 'all'
                        ? n.audienceRole
                        : 'all',
                targetStaffId: typeof n.targetStaffId === 'string' ? n.targetStaffId : null,
                createdAt: typeof n.createdAt === 'string' ? n.createdAt : new Date().toISOString(),
                readBy: Array.isArray(n.readBy) ? (n.readBy as string[]) : [],
            } satisfies AppNotification;
        })
        .filter((entry): entry is AppNotification => Boolean(entry));
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
            const role: StaffRole = isStaffRole(user.role) ? user.role : 'server';
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

    for (const seed of DEFAULT_STAFF) {
        if (!migrated.some((user) => user.role === seed.role)) {
            migrated.push({ ...seed });
        }
    }

    void activeStaffId;
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
        version: 4,
        menu: withModifiers(raw.menu as MenuItem[]),
        tables,
        activeTableId,
        sales: migrateSales(raw.sales),
        restaurant:
            raw.restaurant && typeof raw.restaurant === 'object'
                ? { ...DEFAULT_RESTAURANT, ...(raw.restaurant as PersistedState['restaurant']) }
                : DEFAULT_RESTAURANT,
        staff,
        activeStaffId,
        nextOrderSeq: Math.max(1, Number(raw.nextOrderSeq ?? 1)),
        notifications: migrateNotifications(raw.notifications),
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

export function notificationsForStaff(
    notifications: AppNotification[],
    staff: StaffUser,
): AppNotification[] {
    return notifications
        .filter((n) => {
            if (n.targetStaffId && n.targetStaffId === staff.id) return true;
            if (n.audienceRole === 'all') return true;
            if (n.audienceRole === staff.role) return true;
            if (staff.role === 'manager' || staff.role === 'admin') {
                return n.kind === 'kitchen_ticket' || n.kind === 'server_ack';
            }
            return false;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
