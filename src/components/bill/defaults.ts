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

/** Default happy hour: 4pm–7pm local, every day */
export const DEFAULT_HAPPY_HOUR = {
    startHour: 16,
    endHour: 19,
} as const;

export const DEFAULT_SETTINGS: PosSettings = {
    xcgPerUsd: DEFAULT_XCG_PER_USD,
    defaultServiceChargePercent: DEFAULT_SERVICE_CHARGE_PERCENT,
    shiftOpenedAt: null,
    shiftClosedAt: null,
    bumpAfterMinutes: 8,
    idleLockMinutes: 5,
    autoFireDrinks: true,
};
/** @deprecated use DEFAULT_SERVICE_CHARGE_PERCENT */
export const DEFAULT_TAX_PERCENT = DEFAULT_SERVICE_CHARGE_PERCENT;
export const PLACEHOLDER_IMAGE = '/menu/1.svg';

export const DEFAULT_RESTAURANT: RestaurantProfile = {
    name: 'Authentic Jamaican Cuisine & Bar',
    tagline: 'Country kitchen · market-fresh · coal pot fire',
    address: '14 Front Street, Philipsburg, Sint Maarten',
    phone: '+1 (721) 555-0142',
    taxId: 'TAX-SXM-48291',
    feedbackUrl: 'https://savory.example/feedback',
};

export const DEFAULT_STAFF: StaffUser[] = [
    { id: 'staff_server', name: 'Alex Morgan', role: 'server', pin: '1234', initials: 'AM' },
    { id: 'staff_kitchen', name: 'Casey Cook', role: 'kitchen', pin: '2222', initials: 'CC' },
    { id: 'staff_bartender', name: 'Morgan Rum', role: 'bartender', pin: '3333', initials: 'MR' },
    { id: 'staff_admin', name: 'Riley Admin', role: 'admin', pin: '5555', initials: 'RA' },
    { id: 'staff_manager', name: 'Jordan Lee', role: 'manager', pin: '9999', initials: 'JL' },
];

/** @deprecated use DEFAULT_STAFF / state.staff */
export const STAFF_USERS = DEFAULT_STAFF;

export const DEFAULT_PREP_GROUP: ModifierGroup = {
    id: 'prep',
    name: 'Prep',
    multi: true,
    options: [
        { id: 'no-onion', name: 'No onion', priceDeltaCents: 0 },
        { id: 'extra-spicy', name: 'Extra spicy', priceDeltaCents: 0 },
        { id: 'no-bonnet', name: 'No scotch bonnet', priceDeltaCents: 0 },
    ],
};

export const DEFAULT_SIDES_GROUP: ModifierGroup = {
    id: 'sides',
    name: 'Side swap',
    multi: false,
    options: [
        { id: 'rice-peas', name: 'Rice & peas', priceDeltaCents: 0 },
        { id: 'festival', name: 'Festival', priceDeltaCents: 100 },
        { id: 'plantain', name: 'Sweet plantain', priceDeltaCents: 125 },
        { id: 'callaloo', name: 'Callaloo', priceDeltaCents: 150 },
    ],
};

/** Ensure Prep + Side swap exist (editable in Menu admin). Extra groups are kept. */
export function ensureCoreModifierGroups(groups: ModifierGroup[] = []): ModifierGroup[] {
    const byId = new Map(groups.map((group) => [group.id, group]));
    const prep = byId.get('prep') ?? { ...DEFAULT_PREP_GROUP, options: DEFAULT_PREP_GROUP.options.map((o) => ({ ...o })) };
    const sides =
        byId.get('sides') ??
        { ...DEFAULT_SIDES_GROUP, options: DEFAULT_SIDES_GROUP.options.map((o) => ({ ...o })) };
    const extras = groups.filter((group) => group.id !== 'prep' && group.id !== 'sides');
    return [
        { ...prep, name: 'Prep', multi: true },
        { ...sides, name: 'Side swap', multi: false },
        ...extras,
    ];
}

const sharedMods = (extras: ModifierGroup[] = []): ModifierGroup[] => [
    ...ensureCoreModifierGroups([]),
    ...extras,
];

export const DEFAULT_MENU: MenuItem[] = [
    {
        id: '1',
        name: 'Jerk Chicken',
        description: 'Pimento wood smoke, scotch bonnet marinade, festival',
        category: 'Mains',
        priceCents: 2450,
        image: '/menu/1.svg',
        popular: true,
        modifierGroups: sharedMods([
            {
                id: 'heat',
                name: 'Heat',
                multi: false,
                options: [
                    { id: 'mild', name: 'Mild', priceDeltaCents: 0 },
                    { id: 'yard', name: 'Yard hot', priceDeltaCents: 0 },
                    { id: 'bonnet', name: 'Extra bonnet', priceDeltaCents: 50 },
                ],
            },
        ]),
    },
    {
        id: '2',
        name: 'Ackee & Saltfish',
        description: 'National plate with callaloo, boiled banana, avocado pear',
        category: 'Mains',
        priceCents: 2890,
        image: '/menu/2.svg',
        popular: true,
        modifierGroups: sharedMods(),
    },
    {
        id: '3',
        name: 'Curry Goat',
        description: 'Slow pot curry, thyme, potato, white rice',
        category: 'Mains',
        priceCents: 2680,
        image: '/menu/3.svg',
        popular: true,
        modifierGroups: sharedMods(),
    },
    {
        id: '4',
        name: 'Oxtail Stew',
        description: 'Butter beans, broad thyme, rich gravy',
        category: 'Mains',
        priceCents: 2990,
        image: '/menu/4.svg',
        modifierGroups: sharedMods(),
    },
    {
        id: '5',
        name: 'Festival & Sweet Plantain',
        description: 'Golden fried festival with ripe plantain from the market',
        category: 'Starters',
        priceCents: 990,
        image: '/menu/5.svg',
        modifierGroups: sharedMods(),
    },
    {
        id: '6',
        name: 'Callaloo Sauté',
        description: 'Market callaloo, onion, scotch bonnet, coconut oil',
        category: 'Starters',
        priceCents: 850,
        image: '/menu/6.svg',
        modifierGroups: sharedMods(),
    },
    {
        id: '11',
        name: 'Roasted Breadfruit',
        description: 'Coal-side breadfruit wedges, salted butter',
        category: 'Starters',
        priceCents: 750,
        image: '/market/breadfruit.svg',
        modifierGroups: [],
    },
    {
        id: '12',
        name: 'Fresh Julie Mango',
        description: 'Chilled market mango, lime pinch',
        category: 'Starters',
        priceCents: 650,
        image: '/market/mango.svg',
        popular: true,
        modifierGroups: [],
    },
    {
        id: '7',
        name: 'Sorrel Punch',
        description: 'Homemade sorrel, ginger, clove, over ice',
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
                    { id: 'extra-ginger', name: 'Extra ginger', priceDeltaCents: 0 },
                ],
            },
        ],
    },
    {
        id: '8',
        name: 'Jelly Coconut Water',
        description: 'Fresh coconut water from the husk',
        category: 'Drinks',
        priceCents: 600,
        image: '/menu/8.svg',
        modifierGroups: [],
    },
    {
        id: '13',
        name: 'Rum Punch',
        description: 'Appleton blend, fruit juices, grenadine, nutmeg',
        category: 'Drinks',
        priceCents: 950,
        image: '/menu/7.svg',
        popular: true,
        happyHour: { ...DEFAULT_HAPPY_HOUR, priceCents: 750 },
        modifierGroups: [
            {
                id: 'drink',
                name: 'Drink options',
                multi: true,
                options: [
                    { id: 'less-ice', name: 'Less ice', priceDeltaCents: 0 },
                    { id: 'strong', name: 'Strong pour', priceDeltaCents: 150 },
                ],
            },
        ],
    },
    {
        id: '14',
        name: 'Red Stripe',
        description: 'Ice-cold Jamaican lager, bottle',
        category: 'Drinks',
        priceCents: 550,
        image: '/menu/8.svg',
        popular: true,
        happyHour: { ...DEFAULT_HAPPY_HOUR, priceCents: 400 },
        modifierGroups: [],
    },
    {
        id: '15',
        name: 'Dragon Stout',
        description: 'Dark sweet stout, bottle',
        category: 'Drinks',
        priceCents: 600,
        image: '/menu/8.svg',
        happyHour: { ...DEFAULT_HAPPY_HOUR, priceCents: 450 },
        modifierGroups: [],
    },
    {
        id: '9',
        name: 'Sweet Potato Pudding',
        description: 'Oven pudding with coconut milk & spice',
        category: 'Desserts',
        priceCents: 1080,
        image: '/menu/9.svg',
        popular: true,
        modifierGroups: [
            {
                id: 'dessert',
                name: 'Dessert extras',
                multi: true,
                options: [{ id: 'extra-coconut', name: 'Extra coconut', priceDeltaCents: 100 }],
            },
        ],
    },
    {
        id: '10',
        name: 'Gizzada',
        description: 'Pinched tart shell, sweet spiced coconut',
        category: 'Desserts',
        priceCents: 850,
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
    checkKind: TableOrder['checkKind'] = 'table',
): TableOrder {
    const guestId = createId('guest');
    return {
        id: createId('table'),
        label,
        checkKind,
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

/** Standup bar tab — no floor table required. */
export function createBarTab(
    guestName: string,
    serviceChargePercent = DEFAULT_SERVICE_CHARGE_PERCENT,
): TableOrder {
    const name = guestName.trim() || 'Guest';
    const tab = createTable(`Tab · ${name}`, serviceChargePercent, 'bar_tab');
    tab.guests[0].name = name;
    return tab;
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
            unitPriceSnapshotCents: 2450,
            compReason: null,
        },
        {
            id: createId('line'),
            menuItemId: '7',
            quantity: 2,
            guestId: tables[0].guests[0].id,
            note: 'Extra ginger',
            modifiers: [],
            kitchenStatus: 'draft',
            sentToKitchenAt: null,
            orderNumber: null,
            sentByStaffId: null,
            courseFire: 'fire',
            bumpedAt: null,
            bumpCount: 0,
            unitPriceSnapshotCents: 750,
            compReason: null,
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
                message: 'Table 12 · ORD-DEMO-0001 · Jerk Chicken ready for prep',
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
