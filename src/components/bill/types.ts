export const MENU_CATEGORIES = ['Mains', 'Starters', 'Drinks', 'Desserts'] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export type FilterCategory = 'All' | MenuCategory;

export const TIP_PRESETS = [0, 10, 15, 18] as const;
export type TipPreset = (typeof TIP_PRESETS)[number] | 'custom';

export type MenuItem = {
    id: string;
    name: string;
    description: string;
    category: MenuCategory;
    priceCents: number;
    image: string;
    popular?: boolean;
};

export type Guest = {
    id: string;
    name: string;
};

export type OrderLine = {
    menuItemId: string;
    quantity: number;
    guestId: string | null;
};

export type TableStatus = 'open' | 'paid';

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
};

export type PersistedState = {
    version: 1;
    menu: MenuItem[];
    tables: TableOrder[];
    activeTableId: string;
};

export type BillSnapshot = {
    restaurant: string;
    tableLabel: string;
    generatedAt: string;
    status: TableStatus;
    items: Array<{
        name: string;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
        guestName: string | null;
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
};
