export const MENU_CATEGORIES = ['Mains', 'Starters', 'Drinks', 'Desserts'] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export type FilterCategory = 'All' | MenuCategory;

export const TIP_PRESETS = [0, 10, 15, 18] as const;
export type TipPreset = (typeof TIP_PRESETS)[number] | 'custom';

export type StaffRole = 'server' | 'manager';
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
    tipPreset: TipPreset;
    tipCustomPercent: number;
    taxEnabled: boolean;
    taxPercent: number;
    billGeneratedAt: string | null;
    paidAt: string | null;
    payment: PaymentTender | null;
};

export type SaleRecord = {
    id: string;
    tableId: string;
    tableLabel: string;
    paidAt: string;
    subtotalCents: number;
    taxCents: number;
    tipCents: number;
    totalCents: number;
    payment: PaymentTender;
    serverName: string;
    itemCount: number;
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

export type PersistedState = {
    version: 2;
    menu: MenuItem[];
    tables: TableOrder[];
    activeTableId: string;
    sales: SaleRecord[];
    restaurant: RestaurantProfile;
    activeStaffId: string;
};

export type BillSnapshot = {
    restaurant: RestaurantProfile;
    tableLabel: string;
    generatedAt: string;
    status: TableStatus;
    serverName: string;
    items: Array<{
        name: string;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
        guestName: string | null;
        note: string;
        modifiers: string[];
    }>;
    guests: Array<{
        name: string;
        subtotalCents: number;
        taxCents: number;
        tipCents: number;
        totalCents: number;
    }>;
    subtotalCents: number;
    taxEnabled: boolean;
    taxPercent: number;
    taxCents: number;
    tipPercent: number;
    tipCents: number;
    totalCents: number;
    payment: PaymentTender | null;
};
