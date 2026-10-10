import {
    createDefaultState,
    createId,
    DEFAULT_MENU,
    DEFAULT_RESTAURANT,
    DEFAULT_SERVICE_CHARGE_PERCENT,
    DEFAULT_SETTINGS,
    DEFAULT_STAFF,
    DEFAULT_XCG_PER_USD,
    ensureCoreModifierGroups,
    LEGACY_STORAGE_KEYS,
    STORAGE_KEY,
} from './defaults';
import { applyEnrichment, localEnrichMenuItem } from './menuAi';
import { initialsFromName } from './roles';
import type {
    AppNotification,
    MenuItem,
    OrderLine,
    PersistedState,
    PosSettings,
    RestaurantProfile,
    SaleRecord,
    StaffRole,
    StaffUser,
    TableOrder,
    TipAmountPreset,
} from './types';
import { STAFF_ROLES, TIP_AMOUNT_PRESETS } from './types';

const LEGACY_RESTAURANT_NAMES = new Set(['Savory Kitchen & Bar', 'SAVORY', 'Savory']);

function migrateRestaurant(raw: unknown): RestaurantProfile {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_RESTAURANT };
    const merged = { ...DEFAULT_RESTAURANT, ...(raw as Partial<RestaurantProfile>) };
    if (!merged.name || LEGACY_RESTAURANT_NAMES.has(merged.name)) {
        merged.name = DEFAULT_RESTAURANT.name;
    }
    return merged;
}

const LEGACY_MENU_MARKERS = ['Truffle Mushroom Pasta', 'Smash Burger', 'Basque Cheesecake'];

function withModifiers(menu: MenuItem[]): MenuItem[] {
    const looksLegacy = menu.some((item) => LEGACY_MENU_MARKERS.includes(item.name));
    if (looksLegacy || menu.length === 0) {
        return DEFAULT_MENU.map((item) => ({
            ...item,
            modifierGroups: item.modifierGroups.map((group) => ({
                ...group,
                options: group.options.map((option) => ({ ...option })),
            })),
        }));
    }
    const defaults = new Map(DEFAULT_MENU.map((item) => [item.id, item]));
    const migrated = menu.map((item) => {
        const seed = defaults.get(item.id);
        const baseGroups = item.modifierGroups?.length
            ? item.modifierGroups
            : seed?.modifierGroups ?? [];
        const category =
            item.category === 'Mains' ||
            item.category === 'Starters' ||
            item.category === 'Drinks' ||
            item.category === 'Wine' ||
            item.category === 'Champagne' ||
            item.category === 'Rum' ||
            item.category === 'Desserts'
                ? item.category
                : (seed?.category ?? 'Mains');
        return {
            ...item,
            category,
            eightySixed: item.eightySixed === true,
            happyHour:
                item.happyHour && typeof item.happyHour === 'object'
                    ? item.happyHour
                    : (seed?.happyHour ?? null),
            origin:
                typeof item.origin === 'string'
                    ? item.origin
                    : (seed?.origin ?? null),
            vintageYear:
                typeof item.vintageYear === 'number'
                    ? item.vintageYear
                    : (seed?.vintageYear ?? null),
            prepGuide:
                typeof item.prepGuide === 'string'
                    ? item.prepGuide
                    : (seed?.prepGuide ?? null),
            pairingNotes:
                typeof item.pairingNotes === 'string'
                    ? item.pairingNotes
                    : (seed?.pairingNotes ?? null),
            ingredients:
                typeof item.ingredients === 'string'
                    ? item.ingredients
                    : (seed?.ingredients ?? null),
            modifierGroups:
                category === 'Mains' || category === 'Starters' || category === 'Desserts'
                    ? ensureCoreModifierGroups(baseGroups)
                    : baseGroups.length
                      ? baseGroups
                      : seed?.modifierGroups ?? [],
        };
    });

    // Merge in any missing seed beverages / dishes so catalog upgrades land for existing saves.
    for (const seed of DEFAULT_MENU) {
        if (!migrated.some((item) => item.id === seed.id)) {
            migrated.push({
                ...seed,
                eightySixed: seed.eightySixed === true,
                happyHour: seed.happyHour ?? null,
                origin: seed.origin ?? null,
                vintageYear: seed.vintageYear ?? null,
                prepGuide: seed.prepGuide ?? null,
                pairingNotes: seed.pairingNotes ?? null,
                ingredients: seed.ingredients ?? null,
                modifierGroups: seed.modifierGroups.map((group) => ({
                    ...group,
                    options: group.options.map((option) => ({ ...option })),
                })),
            });
        }
    }

    return migrated.map((item) => {
        if (item.prepGuide && item.ingredients && item.pairingNotes) return item;
        return applyEnrichment(item, localEnrichMenuItem(item));
    });
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
        courseFire:
            line.courseFire === 'hold' || line.courseFire === 'all_day' || line.courseFire === 'fire'
                ? line.courseFire
                : 'fire',
        bumpedAt: typeof line.bumpedAt === 'string' ? line.bumpedAt : null,
        bumpCount: Math.max(0, Number(line.bumpCount ?? 0)),
        unitPriceSnapshotCents:
            typeof line.unitPriceSnapshotCents === 'number' &&
            Number.isFinite(line.unitPriceSnapshotCents)
                ? Math.max(0, Math.round(line.unitPriceSnapshotCents))
                : null,
        compReason: typeof line.compReason === 'string' && line.compReason ? line.compReason : null,
    }));
}

function migrateGuests(guests: unknown): TableOrder['guests'] {
    if (!Array.isArray(guests)) return [];
    return guests.map((entry, index) => {
        const guest = (entry ?? {}) as Record<string, unknown>;
        return {
            id: typeof guest.id === 'string' ? guest.id : createId('guest'),
            name: String(guest.name ?? `Guest ${index + 1}`),
            paidAt: typeof guest.paidAt === 'string' ? guest.paidAt : null,
            payment: (guest.payment as TableOrder['guests'][number]['payment']) ?? null,
        };
    });
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
        ? { tipAmountPreset: match as TipAmountPreset, tipCents: match }
        : { tipAmountPreset: tipCents === 0 ? 0 : 'custom', tipCents };
}

function migrateTables(tables: Array<Record<string, unknown>>): TableOrder[] {
    return tables.map((table) => {
        const tip = migrateTipFields(table);
        const label = String(table.label ?? 'Table');
        const checkKind =
            table.checkKind === 'bar_tab' || /^Tab\s*·/i.test(label) ? 'bar_tab' : 'table';
        return {
            id: String(table.id),
            label,
            checkKind,
            status:
                table.status === 'paid' ? 'paid' : table.status === 'partial' ? 'partial' : 'open',
            lines: migrateLegacyLines(
                Array.isArray(table.lines) ? (table.lines as Array<Record<string, unknown>>) : [],
            ),
            guests: migrateGuests(table.guests),
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
            compCents: Math.max(0, Number(sale.compCents ?? 0)),
            payment: sale.payment as SaleRecord['payment'],
            serverName: String(sale.serverName ?? 'Server'),
            itemCount: Number(sale.itemCount ?? 0),
            orderNumbers: Array.isArray(sale.orderNumbers)
                ? (sale.orderNumbers as string[])
                : [],
            guestName: typeof sale.guestName === 'string' ? sale.guestName : null,
            guestId: typeof sale.guestId === 'string' ? sale.guestId : null,
            checkKind:
                sale.checkKind === 'bar_tab' || sale.checkKind === 'table'
                    ? sale.checkKind
                    : /^Tab\s*·/i.test(String(sale.tableLabel ?? ''))
                      ? 'bar_tab'
                      : 'table',
        };
    });
}

function migrateAuditLog(raw: unknown): PersistedState['auditLog'] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const a = entry as Record<string, unknown>;
            const kind =
                a.kind === 'void_payment' ||
                a.kind === 'void_line' ||
                a.kind === 'void_ticket' ||
                a.kind === 'comp'
                    ? a.kind
                    : 'void_ticket';
            return {
                id: typeof a.id === 'string' ? a.id : createId('audit'),
                kind,
                reason: String(a.reason ?? ''),
                staffId: String(a.staffId ?? ''),
                staffName: String(a.staffName ?? 'Staff'),
                createdAt: typeof a.createdAt === 'string' ? a.createdAt : new Date().toISOString(),
                details: String(a.details ?? ''),
                tableLabel: typeof a.tableLabel === 'string' ? a.tableLabel : null,
            };
        })
        .filter((entry): entry is PersistedState['auditLog'][number] => Boolean(entry));
}

function migrateNotifications(raw: unknown): AppNotification[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const n = entry as Record<string, unknown>;
            return {
                id: typeof n.id === 'string' ? n.id : createId('notif'),
                kind:
                    n.kind === 'server_ack'
                        ? 'server_ack'
                        : n.kind === 'bump_alert'
                          ? 'bump_alert'
                          : n.kind === 'bar_ticket'
                            ? 'bar_ticket'
                            : 'kitchen_ticket',
                title: String(n.title ?? 'Notification'),
                message: String(n.message ?? ''),
                orderNumber: typeof n.orderNumber === 'string' ? n.orderNumber : null,
                tableLabel: typeof n.tableLabel === 'string' ? n.tableLabel : null,
                audienceRole:
                    n.audienceRole === 'kitchen' ||
                    n.audienceRole === 'bartender' ||
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

    const rawSettings =
        raw.settings && typeof raw.settings === 'object'
            ? (raw.settings as Partial<PosSettings>)
            : {};
    const settings: PosSettings = {
        xcgPerUsd: Math.max(
            0.01,
            Number(rawSettings.xcgPerUsd ?? DEFAULT_XCG_PER_USD),
        ),
        defaultServiceChargePercent: Math.max(
            0,
            Number(
                rawSettings.defaultServiceChargePercent ?? DEFAULT_SERVICE_CHARGE_PERCENT,
            ),
        ),
        shiftOpenedAt:
            typeof rawSettings.shiftOpenedAt === 'string' ? rawSettings.shiftOpenedAt : null,
        shiftClosedAt:
            typeof rawSettings.shiftClosedAt === 'string' ? rawSettings.shiftClosedAt : null,
        bumpAfterMinutes: Math.max(
            1,
            Number(rawSettings.bumpAfterMinutes ?? DEFAULT_SETTINGS.bumpAfterMinutes),
        ),
        idleLockMinutes: Math.max(
            0,
            Number(rawSettings.idleLockMinutes ?? DEFAULT_SETTINGS.idleLockMinutes),
        ),
        autoFireDrinks:
            rawSettings.autoFireDrinks !== undefined
                ? rawSettings.autoFireDrinks !== false
                : DEFAULT_SETTINGS.autoFireDrinks,
    };

    return {
        version: 6,
        menu: withModifiers(raw.menu as MenuItem[]),
        tables,
        activeTableId,
        sales: migrateSales(raw.sales),
        restaurant: migrateRestaurant(raw.restaurant),
        staff,
        activeStaffId,
        nextOrderSeq: Math.max(1, Number(raw.nextOrderSeq ?? 1)),
        notifications: migrateNotifications(raw.notifications),
        settings: { ...DEFAULT_SETTINGS, ...settings },
        auditLog: migrateAuditLog(raw.auditLog),
        updatedAt: Math.max(0, Number(raw.updatedAt ?? Date.now())),
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

export function touchState(state: PersistedState): PersistedState {
    return { ...state, version: 6, updatedAt: Date.now() };
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
                return (
                    n.kind === 'kitchen_ticket' ||
                    n.kind === 'bar_ticket' ||
                    n.kind === 'server_ack' ||
                    n.kind === 'bump_alert'
                );
            }
            return false;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
