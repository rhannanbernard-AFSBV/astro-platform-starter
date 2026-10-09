export const MENU_CATEGORIES = [
    'Mains',
    'Starters',
    'Drinks',
    'Wine',
    'Champagne',
    'Rum',
    'Desserts',
] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export type FilterCategory = 'All' | MenuCategory;

/** Short labels for category chips (Wine → Wine List). */
export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = {
    Mains: 'Mains',
    Starters: 'Starters',
    Drinks: 'Drinks',
    Wine: 'Wine List',
    Champagne: 'Champagne',
    Rum: 'Rum',
    Desserts: 'Desserts',
};

export const BEVERAGE_CATEGORIES: readonly MenuCategory[] = [
    'Drinks',
    'Wine',
    'Champagne',
    'Rum',
] as const;

export const FOOD_CATEGORIES: readonly MenuCategory[] = [
    'Mains',
    'Starters',
    'Desserts',
] as const;

export type MenuCatalogKind = 'meals' | 'bar';

/** Tip presets in USD cents (not percentages). */
export const TIP_AMOUNT_PRESETS = [0, 200, 500, 1000, 1500] as const;
export type TipAmountPreset = (typeof TIP_AMOUNT_PRESETS)[number] | 'custom';

export const STAFF_ROLES = ['kitchen', 'bartender', 'server', 'admin', 'manager'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type AppView = 'service' | 'kitchen' | 'bar' | 'reports' | 'admin' | 'users';
export type PaymentMethod = 'cash' | 'card' | 'mixed';
export type KitchenStatus = 'draft' | 'queued' | 'preparing' | 'ready' | 'served';
export type TableStatus = 'open' | 'paid' | 'partial';
export type CourseFire = 'hold' | 'fire' | 'all_day';
export type ReceiptTemplate = 'guest' | 'kitchen' | 'paid';

export const COURSE_FIRE_OPTIONS = ['hold', 'fire', 'all_day'] as const;
export const COURSE_FIRE_LABELS: Record<CourseFire, string> = {
    hold: 'Hold',
    fire: 'Fire',
    all_day: 'All-day',
};

export type ModifierOption = {
    id: string;
    name: string;
    priceDeltaCents: number;
};

export type ModifierGroup = {
    id: string;
    name: string;
    multi: boolean;
    options: ModifierOption[];
};

/** Local-time pour / happy-hour window (hours 0–23). */
export type HappyHourWindow = {
    priceCents: number;
    /** Inclusive start hour (local) */
    startHour: number;
    /** Exclusive end hour (local); may wrap past midnight */
    endHour: number;
    /** 0=Sun … 6=Sat; omit or empty = every day */
    daysOfWeek?: number[];
};

export type MenuItem = {
    id: string;
    name: string;
    description: string;
    category: MenuCategory;
    priceCents: number;
    image: string;
    popular?: boolean;
    /** Out of stock — greyed out on Service / bar */
    eightySixed?: boolean;
    /** Optional time-window pour price */
    happyHour?: HappyHourWindow | null;
    /** Wine / champagne / spirit origin */
    origin?: string | null;
    /** Vintage year when applicable */
    vintageYear?: number | null;
    /** GPT-4o / AI: professional prep method */
    prepGuide?: string | null;
    /** GPT-4o / AI: wine↔meal or drink pairings */
    pairingNotes?: string | null;
    /** GPT-4o / AI: ingredient breakdown */
    ingredients?: string | null;
    modifierGroups: ModifierGroup[];
};

export type SelectedModifier = {
    groupId: string;
    optionId: string;
    name: string;
    priceDeltaCents: number;
};

export type Guest = {
    id: string;
    name: string;
    paidAt: string | null;
    payment: PaymentTender | null;
};

export type OrderLine = {
    id: string;
    menuItemId: string;
    quantity: number;
    guestId: string | null;
    note: string;
    modifiers: SelectedModifier[];
    kitchenStatus: KitchenStatus;
    sentToKitchenAt: string | null;
    orderNumber: string | null;
    sentByStaffId: string | null;
    courseFire: CourseFire;
    bumpedAt: string | null;
    bumpCount: number;
    /** Unit price locked at add (includes modifiers + happy hour); null = live lookup */
    unitPriceSnapshotCents: number | null;
    /** When set, line is fully comped ($0) but remains on the check */
    compReason: string | null;
};

export type PaymentTender = {
    method: PaymentMethod;
    cashCents: number;
    cardCents: number;
    changeDueCents: number;
    paidAt: string;
};

export type CheckKind = 'table' | 'bar_tab';

export type TableOrder = {
    id: string;
    label: string;
    /** Floor table vs standup bar tab */
    checkKind: CheckKind;
    status: TableStatus;
    lines: OrderLine[];
    guests: Guest[];
    tipAmountPreset: TipAmountPreset;
    tipCents: number;
    serviceChargeEnabled: boolean;
    serviceChargePercent: number;
    billGeneratedAt: string | null;
    paidAt: string | null;
    payment: PaymentTender | null;
    guestSignatureDataUrl: string | null;
    guestPreferredPayment: PaymentMethod | null;
    guestBillApprovedAt: string | null;
};

export type SaleRecord = {
    id: string;
    tableId: string;
    tableLabel: string;
    paidAt: string;
    subtotalCents: number;
    serviceChargeCents: number;
    tipCents: number;
    totalCents: number;
    /** Sum of pre-comp line totals that were written off */
    compCents: number;
    payment: PaymentTender;
    serverName: string;
    itemCount: number;
    orderNumbers: string[];
    guestName: string | null;
    guestId: string | null;
};

export type RestaurantProfile = {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    taxId: string;
    feedbackUrl: string;
};

export type PosSettings = {
    xcgPerUsd: number;
    defaultServiceChargePercent: number;
    shiftOpenedAt: string | null;
    shiftClosedAt: string | null;
    /** Minutes in Queued before visual bump escalation */
    bumpAfterMinutes: number;
    /** Minutes without activity before the station UI locks (0 = off) */
    idleLockMinutes: number;
    /** When true, adding a drink immediately fires it to the bar rail */
    autoFireDrinks: boolean;
};

export type StaffUser = {
    id: string;
    name: string;
    role: StaffRole;
    pin: string;
    initials: string;
};

export type AppNotification = {
    id: string;
    kind: 'kitchen_ticket' | 'bar_ticket' | 'server_ack' | 'bump_alert';
    title: string;
    message: string;
    orderNumber: string | null;
    tableLabel: string | null;
    audienceRole: StaffRole | 'all';
    targetStaffId: string | null;
    createdAt: string;
    readBy: string[];
};

export type AuditEntry = {
    id: string;
    kind: 'void_ticket' | 'void_payment' | 'void_line' | 'comp';
    reason: string;
    staffId: string;
    staffName: string;
    createdAt: string;
    details: string;
    tableLabel: string | null;
};

export const COMP_REASON_PRESETS = [
    'Spill / remake',
    'VIP / host',
    'Staff drink',
    'Manager goodwill',
    'Other',
] as const;

export const VOID_REASON_PRESETS = [
    'Guest changed mind',
    'Wrong item / modifier',
    '86’d / out of stock',
    'Duplicate ticket',
    'Other',
] as const;

export type PersistedState = {
    version: 6;
    menu: MenuItem[];
    tables: TableOrder[];
    activeTableId: string;
    sales: SaleRecord[];
    restaurant: RestaurantProfile;
    staff: StaffUser[];
    activeStaffId: string;
    nextOrderSeq: number;
    notifications: AppNotification[];
    settings: PosSettings;
    auditLog: AuditEntry[];
    /** Epoch ms for cross-tab last-write-wins sync */
    updatedAt: number;
};

export type BillSnapshot = {
    restaurant: RestaurantProfile;
    tableLabel: string;
    generatedAt: string;
    status: TableStatus;
    serverName: string;
    orderNumbers: string[];
    template: ReceiptTemplate;
    items: Array<{
        name: string;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
        guestName: string | null;
        note: string;
        modifiers: string[];
        orderNumber: string | null;
        kitchenStatus?: KitchenStatus;
        courseFire?: CourseFire;
        category?: MenuCategory;
        compReason?: string | null;
    }>;
    guests: Array<{
        id: string;
        name: string;
        subtotalCents: number;
        serviceChargeCents: number;
        tipCents: number;
        totalCents: number;
        paidAt: string | null;
    }>;
    subtotalCents: number;
    serviceChargeEnabled: boolean;
    serviceChargePercent: number;
    serviceChargeCents: number;
    tipCents: number;
    totalCents: number;
    payment: PaymentTender | null;
    guestSignatureDataUrl: string | null;
    guestPreferredPayment: PaymentMethod | null;
};
