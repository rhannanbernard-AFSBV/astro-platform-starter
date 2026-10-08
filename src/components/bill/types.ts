export const MENU_CATEGORIES = ['Mains', 'Starters', 'Drinks', 'Desserts'] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export type FilterCategory = 'All' | MenuCategory;

/** Tip presets in USD cents (not percentages). */
export const TIP_AMOUNT_PRESETS = [0, 200, 500, 1000, 1500] as const;
export type TipAmountPreset = (typeof TIP_AMOUNT_PRESETS)[number] | 'custom';

export const STAFF_ROLES = ['kitchen', 'server', 'admin', 'manager'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type AppView = 'service' | 'kitchen' | 'reports' | 'admin' | 'users';
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

export type MenuItem = {
    id: string;
    name: string;
    description: string;
    category: MenuCategory;
    priceCents: number;
    image: string;
    popular?: boolean;
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
};

export type PaymentTender = {
    method: PaymentMethod;
    cashCents: number;
    cardCents: number;
    changeDueCents: number;
    paidAt: string;
};

export type TableOrder = {
    id: string;
    label: string;
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
    kind: 'kitchen_ticket' | 'server_ack' | 'bump_alert';
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
    kind: 'void_ticket' | 'void_payment' | 'void_line';
    reason: string;
    staffId: string;
    staffName: string;
    createdAt: string;
    details: string;
    tableLabel: string | null;
};

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
