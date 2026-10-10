export type GuestCategory = 'Jerk' | 'Seafood' | 'Ital' | 'Patties';

export type GuestDish = {
    id: string;
    name: string;
    category: GuestCategory;
    tagline: string;
    description: string;
    priceCents: number;
    image: string;
    popular?: boolean;
};

/** Guest-facing catalog — USD cents; XCG shown at 1.80 */
export const GUEST_CATEGORIES: GuestCategory[] = ['Jerk', 'Seafood', 'Ital', 'Patties'];

export const GUEST_DISHES: GuestDish[] = [
    {
        id: 'jerk-chicken',
        name: 'Jerk Chicken',
        category: 'Jerk',
        tagline: 'Pimento smoke · rice & peas · fried plantain',
        description:
            'Yard-style scotch bonnet marinade, charcoal grill, coconut rice and peas, sweet plantain.',
        priceCents: 2450,
        image: '/menu/1.svg',
        popular: true,
    },
    {
        id: 'jerk-pork',
        name: 'Jerk Pork',
        category: 'Jerk',
        tagline: 'Slow smoke · festival · pickapeppa glaze',
        description: 'Bone-in pork shoulder, allspice crust, festival, house glaze.',
        priceCents: 2680,
        image: '/menu/3.svg',
        popular: true,
    },
    {
        id: 'escovitch',
        name: 'Escovitch Fish',
        category: 'Seafood',
        tagline: 'Crispy snapper · vinegar peppers',
        description: 'Fried whole snapper, pickled onion and scotch bonnet, bammy.',
        priceCents: 2890,
        image: '/menu/4.svg',
        popular: true,
    },
    {
        id: 'curry-shrimp',
        name: 'Curry Shrimp',
        category: 'Seafood',
        tagline: 'Coconut curry · thyme · white rice',
        description: 'Gulf shrimp in rich curry, scallion, hot pepper oil.',
        priceCents: 2790,
        image: '/menu/2.svg',
    },
    {
        id: 'ital-stew',
        name: 'Ital Stew',
        category: 'Ital',
        tagline: 'Root veg · coconut · no salt meat',
        description: 'Market roots, pumpkin, callaloo, coconut milk, herbs.',
        priceCents: 1890,
        image: '/menu/6.svg',
        popular: true,
    },
    {
        id: 'callaloo-plate',
        name: 'Callaloo Plate',
        category: 'Ital',
        tagline: 'Market greens · roast breadfruit',
        description: 'Sautéed callaloo, onion, coconut oil, breadfruit wedges.',
        priceCents: 1650,
        image: '/market/callaloo.svg',
    },
    {
        id: 'beef-patty',
        name: 'Beef Patty',
        category: 'Patties',
        tagline: 'Flaky turmeric crust · spiced beef',
        description: 'Classic yard patty, hot sauce on the side.',
        priceCents: 450,
        image: '/menu/5.svg',
        popular: true,
    },
    {
        id: 'veggie-patty',
        name: 'Veggie Patty',
        category: 'Patties',
        tagline: 'Callaloo · carrot · mild spice',
        description: 'Golden crust, garden veg filling, coco bread optional.',
        priceCents: 420,
        image: '/market/plantain.svg',
    },
];

export const XCG_PER_USD = 1.8;

export function moneyUsd(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function formatDual(cents: number, rate = XCG_PER_USD) {
    const xcg = Math.round(cents * rate) / 100;
    return `${moneyUsd(cents)} · XCG ${xcg.toFixed(2)}`;
}
