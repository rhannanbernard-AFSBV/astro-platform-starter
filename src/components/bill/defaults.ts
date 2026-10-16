import type {
    MenuItem,
    ModifierGroup,
    PersistedState,
    RestaurantProfile,
    StaffUser,
    TableOrder,
} from './types';

export const STORAGE_KEY = 'savory-bill-generator-v2';
export const DEFAULT_TAX_PERCENT = 5;
export const PLACEHOLDER_IMAGE =
    'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=700&q=85';

export const DEFAULT_RESTAURANT: RestaurantProfile = {
    name: 'Savory Kitchen & Bar',
    tagline: 'Coastal plates · craft drinks',
    address: '14 Front Street, Philipsburg, Sint Maarten',
    phone: '+1 (721) 555-0142',
    taxId: 'TAX-SXM-48291',
    feedbackUrl: 'https://savory.example/feedback',
};

export const STAFF_USERS: StaffUser[] = [
    { id: 'staff_server', name: 'Alex Morgan', role: 'server', pin: '1234', initials: 'AM' },
    { id: 'staff_manager', name: 'Jordan Lee', role: 'manager', pin: '9999', initials: 'JL' },
];

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
        image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=700&q=85',
        popular: true,
        modifierGroups: sharedMods(),
    },
    {
        id: '2',
        name: 'Herb Roasted Salmon',
        description: 'Lemon beurre blanc, greens, baby potatoes',
        category: 'Mains',
        priceCents: 2890,
        image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=700&q=85',
        modifierGroups: sharedMods(),
    },
    {
        id: '3',
        name: 'Smash Burger',
        description: 'Aged cheddar, pickles, house sauce, fries',
        category: 'Mains',
        priceCents: 1980,
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=85',
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
        image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=85',
        modifierGroups: sharedMods(),
    },
    {
        id: '5',
        name: 'Burrata & Tomatoes',
        description: 'Heirloom tomatoes, basil oil, sourdough',
        category: 'Starters',
        priceCents: 1490,
        image: 'https://images.unsplash.com/photo-1625944230945-1b7dd3b949ab?auto=format&fit=crop&w=700&q=85',
        modifierGroups: sharedMods(),
    },
    {
        id: '6',
        name: 'Crispy Calamari',
        description: 'Lemon, parsley, roasted garlic aioli',
        category: 'Starters',
        priceCents: 1380,
        image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=700&q=85',
        modifierGroups: sharedMods(),
    },
    {
        id: '7',
        name: 'Citrus Spritz',
        description: 'Blood orange, rosemary, sparkling water',
        category: 'Drinks',
        priceCents: 750,
        image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=700&q=85',
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
        image: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=700&q=85',
        modifierGroups: [],
    },
    {
        id: '9',
        name: 'Basque Cheesecake',
        description: 'Burnt vanilla cheesecake, seasonal berries',
        category: 'Desserts',
        priceCents: 1080,
        image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=85',
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
        image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=700&q=85',
        modifierGroups: [],
    },
];

export function createId(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createTable(label: string, taxPercent = DEFAULT_TAX_PERCENT): TableOrder {
    const guestId = createId('guest');
    return {
        id: createId('table'),
        label,
        status: 'open',
        lines: [],
        guests: [{ id: guestId, name: 'Guest 1' }],
        tipPreset: 15,
        tipCustomPercent: 15,
        taxEnabled: true,
        taxPercent,
        billGeneratedAt: null,
        paidAt: null,
        payment: null,
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
            modifiers: [{ groupId: 'prep', optionId: 'extra-spicy', name: 'Extra spicy', priceDeltaCents: 0 }],
            kitchenStatus: 'queued',
            sentToKitchenAt: new Date().toISOString(),
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
        },
    ];
    return {
        version: 2,
        menu: DEFAULT_MENU,
        tables,
        activeTableId: tables[0].id,
        sales: [],
        restaurant: DEFAULT_RESTAURANT,
        activeStaffId: STAFF_USERS[0].id,
    };
}
