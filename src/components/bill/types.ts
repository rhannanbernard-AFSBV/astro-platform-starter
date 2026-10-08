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
export type TableStatus = 'open' | 'paid';

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
};

export type RestaurantProfile = {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    taxId: string;
    feedbackUrl: string;
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
    kind: 'kitchen_ticket' | 'server_ack';
    title: string;
    message: string;
    orderNumber: string | null;
    tableLabel: string | null;
    audienceRole: StaffRole | 'all';
    targetStaffId: string | null;
    createdAt: string;
    readBy: string[];
};

export type PersistedState = {
    version: 4;
    menu: MenuItem[];
    tables: TableOrder[];
    activeTableId: string;
    sales: SaleRecord[];
    restaurant: RestaurantProfile;
    staff: StaffUser[];
    activeStaffId: string;
    nextOrderSeq: number;
    notifications: AppNotification[];
};

export type BillSnapshot = {
    restaurant: RestaurantProfile;
    tableLabel: string;
    generatedAt: string;
    status: TableStatus;
    serverName: string;
    orderNumbers: string[];
    items: Array<{
        name: string;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
        guestName: string | null;
        note: string;
        modifiers: string[];
        orderNumber: string | null;
    }>;
    guests: Array<{
        name: string;
        subtotalCents: number;
        serviceChargeCents: number;
        tipCents: number;
        totalCents: number;
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
