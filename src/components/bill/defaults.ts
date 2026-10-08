import type {
    MenuItem,
    ModifierGroup,
    PersistedState,
    PosSettings,
    RestaurantProfile,
    StaffUser,
    TableOrder,
} from './types';

export const STORAGE_KEY = 'savory-bill-generator-v6';
export const LEGACY_STORAGE_KEYS = [
    'savory-bill-generator-v5',
    'savory-bill-generator-v4',
    'savory-bill-generator-v3',
    'savory-bill-generator-v2',
    'savory-bill-generator-v1',
] as const;
export const DEFAULT_SERVICE_CHARGE_PERCENT = 5;
export const DEFAULT_XCG_PER_USD = 1.8;

export const DEFAULT_SETTINGS: PosSettings = {
    xcgPerUsd: DEFAULT_XCG_PER_USD,
    defaultServiceChargePercent: DEFAULT_SERVICE_CHARGE_PERCENT,
    shiftOpenedAt: null,
    shiftClosedAt: null,
    bumpAfterMinutes: 8,
};
/** @deprecated use DEFAULT_SERVICE_CHARGE_PERCENT */
export const DEFAULT_TAX_PERCENT = DEFAULT_SERVICE_CHARGE_PERCENT;
export const PLACEHOLDER_IMAGE = '/menu/1.svg';

export const DEFAULT_RESTAURANT: RestaurantProfile = {
    name: 'Savory Kitchen & Bar',
    tagline: 'Coastal plates · craft drinks',
    address: '14 Front Street, Philipsburg, Sint Maarten',
    phone: '+1 (721) 555-0142',
    taxId: 'TAX-SXM-48291',
    feedbackUrl: 'https://savory.example/feedback',
};

export const DEFAULT_STAFF: StaffUser[] = [
    { id: 'staff_server', name: 'Alex Morgan', role: 'server', pin: '1234', initials: 'AM' },
    { id: 'staff_kitchen', name: 'Casey Cook', role: 'kitchen', pin: '2222', initials: 'CC' },
    { id: 'staff_admin', name: 'Riley Admin', role: 'admin', pin: '5555', initials: 'RA' },
    { id: 'staff_manager', name: 'Jordan Lee', role: 'manager', pin: '9999', initials: 'JL' },
];

/** @deprecated use DEFAULT_STAFF / state.staff */
export const STAFF_USERS = DEFAULT_STAFF;

const sharedMods = (extras: ModifierGroup[] = []): ModifierGroup[] => [
    {
        id: 'prep',
        name: 'Prep',
        multi: true,
        options: [
            { id: 'no-onion', name: 'No onion', priceDeltaCents: 0 },
            { id: 'extra-spicy', name: 'Extra spicy', priceDeltaCents: 0 },
            { id: 'gluten-free', name: 'Gluten-free', priceDeltaCents: 150 },
        ],
    },
    {
        id: 'sides',
        name: 'Side swap',
        multi: false,
        options: [
            { id: 'fries', name: 'Fries', priceDeltaCents: 0 },
            { id: 'salad', name: 'Side salad', priceDeltaCents: 100 },
            { id: 'veg', name: 'Roasted veg', priceDeltaCents: 150 },
        ],
    },
    ...extras,
];

export const DEFAULT_MENU: MenuItem[] = [
    {
        id: '1',
        name: 'Truffle Mushroom Pasta',
        description: 'Wild mushrooms, parmesan, truffle cream',
        category: 'Mains',
        priceCents: 2450,
        image: '/menu/1.svg',
        popular: true,
        modifierGroups: sharedMods(),
    },
    {
        id: '2',
        name: 'Herb Roasted Salmon',
        description: 'Lemon beurre blanc, greens, baby potatoes',
        category: 'Mains',
        priceCents: 2890,
        image: '/menu/2.svg',
        modifierGroups: sharedMods(),
    },
    {
        id: '3',
        name: 'Smash Burger',
        description: 'Aged cheddar, pickles, house sauce, fries',
        category: 'Mains',
        priceCents: 1980,
        image: '/menu/3.svg',
        popular: true,
        modifierGroups: sharedMods([
            {
                id: 'patty',
                name: 'Add-on',
                multi: true,
                options: [
                    { id: 'bacon', name: 'Bacon', priceDeltaCents: 200 },
                    { id: 'avocado', name: 'Avocado', priceDeltaCents: 175 },
                ],
            },
        ]),
    },
    {
        id: '4',
        name: 'Garden Harvest Bowl',
        description: 'Quinoa, avocado, roasted vegetables, tahini',
        category: 'Mains',
        priceCents: 1760,
        image: '/menu/4.svg',
        modifierGroups: sharedMods(),
    },
    {
        id: '5',
        name: 'Burrata & Tomatoes',
        description: 'Heirloom tomatoes, basil oil, sourdough',
        category: 'Starters',
        priceCents: 1490,
        image: '/menu/5.svg',
        modifierGroups: sharedMods(),
    },
    {
        id: '6',
        name: 'Crispy Calamari',
        description: 'Lemon, parsley, roasted garlic aioli',
        category: 'Starters',
        priceCents: 1380,
        image: '/menu/6.svg',
        modifierGroups: sharedMods(),
    },
    {
        id: '7',
        name: 'Citrus Spritz',
        description: 'Blood orange, rosemary, sparkling water',
        category: 'Drinks',
        priceCents: 750,
        image: '/menu/7.svg',
        modifierGroups: [
            {
                id: 'drink',
                name: 'Drink options',
                multi: true,
                options: [
                    { id: 'less-ice', name: 'Less ice', priceDeltaCents: 0 },
                    { id: 'no-rosemary', name: 'No rosemary', priceDeltaCents: 0 },
                ],
            },
        ],
    },
    {
        id: '8',
        name: 'Sparkling Water',
        description: 'Chilled, 750 ml',
        category: 'Drinks',
        priceCents: 520,
        image: '/menu/8.svg',
        modifierGroups: [],
    },
    {
        id: '9',
        name: 'Basque Cheesecake',
        description: 'Burnt vanilla cheesecake, seasonal berries',
        category: 'Desserts',
        priceCents: 1080,
        image: '/menu/9.svg',
        popular: true,
        modifierGroups: [
            {
                id: 'dessert',
                name: 'Dessert extras',
                multi: true,
                options: [{ id: 'extra-berries', name: 'Extra berries', priceDeltaCents: 125 }],
            },
        ],
    },
    {
        id: '10',
        name: 'Chocolate Fondant',
        description: 'Warm chocolate center, sea salt ice cream',
        category: 'Desserts',
        priceCents: 1190,
        image: '/menu/10.svg',
        modifierGroups: [],
    },
];

export function createId(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createTable(
    label: string,
    serviceChargePercent = DEFAULT_SERVICE_CHARGE_PERCENT,
): TableOrder {
    const guestId = createId('guest');
    return {
        id: createId('table'),
        label,
        status: 'open',
        lines: [],
        guests: [{ id: guestId, name: 'Guest 1', paidAt: null, payment: null }],
        tipAmountPreset: 0,
        tipCents: 0,
        serviceChargeEnabled: true,
        serviceChargePercent,
        billGeneratedAt: null,
        paidAt: null,
        payment: null,
        guestSignatureDataUrl: null,
        guestPreferredPayment: null,
        guestBillApprovedAt: null,
    };
}

export function createDefaultState(): PersistedState {
    const tables = [createTable('Table 12'), createTable('Table 7'), createTable('Table 3')];
    tables[0].lines = [
        {
            id: createId('line'),
            menuItemId: '1',
            quantity: 1,
            guestId: tables[0].guests[0].id,
            note: '',
            modifiers: [
                {
                    groupId: 'prep',
                    optionId: 'extra-spicy',
                    name: 'Extra spicy',
                    priceDeltaCents: 0,
                },
            ],
            kitchenStatus: 'queued',
            sentToKitchenAt: new Date(Date.now() - 10 * 60_000).toISOString(),
            orderNumber: 'ORD-DEMO-0001',
            sentByStaffId: 'staff_server',
            courseFire: 'fire',
            bumpedAt: null,
            bumpCount: 0,
        },
        {
            id: createId('line'),
            menuItemId: '7',
            quantity: 2,
            guestId: tables[0].guests[0].id,
            note: 'Less ice',
            modifiers: [],
            kitchenStatus: 'draft',
            sentToKitchenAt: null,
            orderNumber: null,
            sentByStaffId: null,
            courseFire: 'fire',
            bumpedAt: null,
            bumpCount: 0,
        },
    ];
    return {
        version: 6,
        menu: DEFAULT_MENU,
        tables,
        activeTableId: tables[0].id,
        sales: [],
        restaurant: DEFAULT_RESTAURANT,
        staff: DEFAULT_STAFF.map((user) => ({ ...user })),
        activeStaffId: DEFAULT_STAFF[0].id,
        nextOrderSeq: 2,
        settings: {
            ...DEFAULT_SETTINGS,
            shiftOpenedAt: new Date().toISOString(),
        },
        auditLog: [],
        updatedAt: Date.now(),
        notifications: [
            {
                id: createId('notif'),
                kind: 'kitchen_ticket',
                title: 'New kitchen ticket',
                message: 'Table 12 · ORD-DEMO-0001 · 1 item ready for prep',
                orderNumber: 'ORD-DEMO-0001',
                tableLabel: 'Table 12',
                audienceRole: 'kitchen',
                targetStaffId: null,
                createdAt: new Date().toISOString(),
                readBy: [],
            },
            {
                id: createId('notif'),
                kind: 'server_ack',
                title: 'Ticket sent',
                message: 'Your ticket ORD-DEMO-0001 for Table 12 was sent to the kitchen.',
                orderNumber: 'ORD-DEMO-0001',
                tableLabel: 'Table 12',
                audienceRole: 'server',
                targetStaffId: 'staff_server',
                createdAt: new Date().toISOString(),
                readBy: [],
            },
        ],
    };
}
