import type { MenuItem, ModifierGroup } from './types';

const HAPPY_HOUR = { startHour: 16, endHour: 19 } as const;

const drinkOpts = (
    extras: Array<{ id: string; name: string; priceDeltaCents?: number }> = [],
): ModifierGroup[] => [
    {
        id: 'drink',
        name: 'Drink options',
        multi: true,
        options: [
            { id: 'less-ice', name: 'Less ice', priceDeltaCents: 0 },
            { id: 'no-ice', name: 'No ice', priceDeltaCents: 0 },
            ...extras.map((entry) => ({
                id: entry.id,
                name: entry.name,
                priceDeltaCents: entry.priceDeltaCents ?? 0,
            })),
        ],
    },
];

const mocktail = (
    id: string,
    name: string,
    description: string,
    priceCents: number,
    opts?: Partial<MenuItem>,
): MenuItem => ({
    id,
    name,
    description,
    category: 'Drinks',
    priceCents,
    image: '/menu/7.svg',
    modifierGroups: drinkOpts(),
    ...opts,
});

const wine = (
    id: string,
    name: string,
    description: string,
    origin: string,
    vintageYear: number,
    priceCents: number,
): MenuItem => ({
    id,
    name,
    description,
    category: 'Wine',
    priceCents,
    image: '/menu/8.svg',
    origin,
    vintageYear,
    modifierGroups: [],
});

const champagne = (
    id: string,
    name: string,
    description: string,
    origin: string,
    vintageYear: number | null,
    priceCents: number,
): MenuItem => ({
    id,
    name,
    description,
    category: 'Champagne',
    priceCents,
    image: '/menu/8.svg',
    origin,
    vintageYear,
    modifierGroups: [],
});

const rumBottle = (
    id: string,
    name: string,
    description: string,
    origin: string,
    priceCents: number,
    opts?: Partial<MenuItem>,
): MenuItem => ({
    id,
    name,
    description,
    category: 'Rum',
    priceCents,
    image: '/menu/8.svg',
    origin,
    vintageYear: null,
    modifierGroups: [],
    ...opts,
});

const cocktail = (
    id: string,
    name: string,
    description: string,
    priceCents: number,
    opts?: Partial<MenuItem>,
): MenuItem => ({
    id,
    name,
    description,
    category: 'Rum',
    priceCents,
    image: '/menu/7.svg',
    modifierGroups: drinkOpts([{ id: 'strong', name: 'Strong pour', priceDeltaCents: 150 }]),
    ...opts,
});

/** Non-alcoholic mixed drinks (Drinks tab) */
export const MOCKTAIL_MENU: MenuItem[] = [
    mocktail('m01', 'Virgin Mojito', 'Mint, lime, soda, simple syrup — no rum', 650, {
        popular: true,
    }),
    mocktail('m02', 'Shirley Temple', 'Ginger ale, grenadine, cherry', 550),
    mocktail('m03', 'Virgin Piña Colada', 'Pineapple, coconut cream, ice', 700, { popular: true }),
    mocktail('m04', 'Arnold Palmer', 'Half iced tea, half lemonade', 500),
    mocktail('m05', 'Virgin Margarita', 'Lime, orange, agave, salt rim', 650),
    mocktail('m06', 'Cinderella', 'Orange, pineapple, lemon, grenadine', 600),
    mocktail('m07', 'Nojito', 'Classic mojito build without spirit', 650),
    mocktail('m08', 'Island Fruit Punch', 'Guava, pineapple, orange, passion fruit', 600, {
        popular: true,
    }),
    mocktail('m09', 'Virgin Bloody Mary', 'Tomato, spices, celery, lemon', 700),
    mocktail('m10', 'Coconut Cooler', 'Coconut water, lime, mint', 600),
    mocktail('m11', 'Mango Lassi Cooler', 'Mango, yogurt, cardamom, ice', 700),
    mocktail('m12', 'Ginger Beer Cooler', 'Ginger beer, lime, house spice', 550),
    mocktail('m13', 'Lemonade Sparkler', 'Fresh lemonade topped with soda', 500),
    mocktail('m14', 'Passion Fruit Cooler', 'Passion fruit, orange, soda', 650),
    mocktail('m15', 'Virgin Daiquiri', 'Strawberry or classic lime, blended', 700),
    mocktail('m16', 'Apple Spritz NA', 'Apple juice, soda, citrus peel', 550),
    mocktail('m17', 'Cucumber Mint Cooler', 'Cucumber, mint, lime, soda', 600),
    mocktail('m18', 'Hibiscus Lemonade', 'Sorrel-style hibiscus, lemon, sugar', 600),
    mocktail('m19', 'Pineapple Ginger Fizz', 'Pineapple, ginger, soda', 650),
    mocktail('m20', 'Watermelon Agua Fresca', 'Fresh watermelon, lime, light sugar', 600),
    mocktail('m21', 'Berry Smash NA', 'Mixed berries, lemon, soda', 650),
    mocktail('m22', 'Tropical Sunrise', 'Orange, pineapple, grenadine float', 600, {
        popular: true,
    }),
    mocktail('m23', 'Sorrel Punch', 'Homemade sorrel, ginger, clove, over ice', 750, {
        popular: true,
    }),
    mocktail('m24', 'Jelly Coconut Water', 'Fresh coconut water from the husk', 600, {
        image: '/menu/8.svg',
    }),
    mocktail('m25', 'Lime & Soda', 'Fresh lime wedges, soda, simple syrup', 450),
];

/** Wine List tab */
export const WINE_MENU: MenuItem[] = [
    wine(
        'w01',
        'Cloudy Bay Sauvignon Blanc',
        'Crisp gooseberry and citrus; bright with seafood or jerk.',
        'Marlborough, New Zealand',
        2023,
        4200,
    ),
    wine(
        'w02',
        'Kim Crawford Pinot Noir',
        'Soft red fruit and spice; easy with oxtail or curry goat.',
        'Marlborough, New Zealand',
        2022,
        3800,
    ),
    wine(
        'w03',
        'Château Ste. Michelle Chardonnay',
        'Apple, pear, light oak; cool with fried festival.',
        'Columbia Valley, USA',
        2022,
        3200,
    ),
    wine(
        'w04',
        'Trapiche Oak Cask Malbec',
        'Plum and cocoa; bold enough for brown stew.',
        'Mendoza, Argentina',
        2021,
        2900,
    ),
    wine(
        'w05',
        'Frescobaldi Chianti',
        'Cherry and herbs; classic Italian medium body.',
        'Tuscany, Italy',
        2021,
        3600,
    ),
    wine(
        'w06',
        'Josh Cellars Cabernet Sauvignon',
        'Blackcurrant and vanilla; steak-night pour.',
        'California, USA',
        2021,
        3400,
    ),
    wine(
        'w07',
        'Villa Maria Private Bin Riesling',
        'Off-dry lime and apple; pairs with spicy yard heat.',
        'Hawke’s Bay, New Zealand',
        2023,
        3100,
    ),
    wine(
        'w08',
        'Yellow Tail Shiraz',
        'Ripe berry and soft tannin; friendly house red.',
        'South Eastern Australia',
        2022,
        2400,
    ),
];

/** Champagne tab */
export const CHAMPAGNE_MENU: MenuItem[] = [
    champagne(
        'c01',
        'Moët & Chandon Impérial',
        'House champagne — bright apple, toast, fine bubbles.',
        'Épernay, Champagne, France',
        null,
        8500,
    ),
    champagne(
        'c02',
        'Veuve Clicquot Yellow Label',
        'Full and toasty; celebration bottle.',
        'Reims, Champagne, France',
        null,
        9200,
    ),
    champagne(
        'c03',
        'Dom Pérignon Vintage',
        'Prestige cuvée — layered citrus, brioche, long finish.',
        'Hautvillers, Champagne, France',
        2013,
        28500,
    ),
    champagne(
        'c04',
        'Ruinart Blanc de Blancs',
        '100% Chardonnay — chalky, elegant, floral.',
        'Reims, Champagne, France',
        null,
        14500,
    ),
    champagne(
        'c05',
        'Nicolas Feuillatte Réserve',
        'Approachable brut — pear, citrus, easy bubbles.',
        'Chouilly, Champagne, France',
        null,
        6800,
    ),
];

/** Rum bottles + popular alcoholic mixed drinks (Rum tab) */
export const RUM_MENU: MenuItem[] = [
    rumBottle(
        'r01',
        'Appleton Estate Signature',
        'Jamaica’s house blend — orange peel, spice, smooth sip or punch base.',
        'Nassau Valley, Jamaica',
        900,
        { popular: true },
    ),
    rumBottle(
        'r02',
        'Wray & Nephew Overproof',
        '62.5% ABV white rum — yard classic for punches and shots.',
        'Kingston, Jamaica',
        850,
        { popular: true },
    ),
    rumBottle(
        'r03',
        'Myers’s Original Dark',
        'Rich molasses dark rum — baking spice and caramel.',
        'Jamaica',
        800,
    ),
    rumBottle(
        'r04',
        'Mount Gay Eclipse',
        'Barbados gold rum — banana, vanilla, clean finish.',
        'St. Lucy, Barbados',
        950,
    ),
    rumBottle(
        'r05',
        'Diplomático Reserva Exclusiva',
        'Venezuelan dark rum — toffee, orange, dessert neat pour.',
        'La Miel, Venezuela',
        1400,
    ),
    rumBottle(
        'r06',
        'Red Stripe',
        'Ice-cold Jamaican lager, bottle.',
        'Kingston, Jamaica',
        550,
        { popular: true, happyHour: { ...HAPPY_HOUR, priceCents: 400 } },
    ),
    rumBottle(
        'r07',
        'Dragon Stout',
        'Dark sweet stout, bottle.',
        'Jamaica',
        600,
        { happyHour: { ...HAPPY_HOUR, priceCents: 450 } },
    ),
    cocktail('x01', 'Rum Punch', 'Appleton blend, fruit juices, grenadine, nutmeg', 950, {
        popular: true,
        happyHour: { ...HAPPY_HOUR, priceCents: 750 },
    }),
    cocktail('x02', 'Mojito', 'White rum, mint, lime, soda, sugar', 900, { popular: true }),
    cocktail('x03', 'Piña Colada', 'Rum, pineapple, coconut cream', 950, { popular: true }),
    cocktail('x04', 'Daiquiri', 'White rum, lime, simple syrup — shaken', 850),
    cocktail('x05', 'Mai Tai', 'Rum blend, orange curaçao, lime, orgeat', 1100),
    cocktail('x06', 'Dark ’n’ Stormy', 'Dark rum, ginger beer, lime', 900),
    cocktail('x07', 'Cuba Libre', 'Rum, cola, lime', 750),
    cocktail('x08', 'Painkiller', 'Rum, pineapple, orange, cream of coconut, nutmeg', 1050),
    cocktail('x09', 'Hurricane', 'Rum blend, passion fruit, orange, lime', 1100),
    cocktail('x10', 'Zombie', 'Rum blend, citrus, falernum, bitters', 1200),
    cocktail('x11', 'Rum Old Fashioned', 'Aged rum, demerara, bitters, orange', 1000),
    cocktail('x12', 'Bahama Mama', 'Rum, coffee liqueur, pineapple, citrus', 1050),
    cocktail('x13', 'Hot Buttered Rum', 'Dark rum, butter, spice, hot water', 950),
    cocktail('x14', 'Espresso Martini', 'Vodka, coffee liqueur, fresh espresso', 1100, {
        popular: true,
    }),
    cocktail('x15', 'Margarita', 'Tequila, triple sec, lime, salt rim', 950),
    cocktail('x16', 'Cosmopolitan', 'Vodka, triple sec, cranberry, lime', 950),
    cocktail('x17', 'Negroni', 'Gin, Campari, sweet vermouth', 1000),
    cocktail('x18', 'Whiskey Sour', 'Whiskey, lemon, sugar, optional egg white', 950),
    cocktail('x19', 'Long Island Iced Tea', 'Vodka, rum, gin, tequila, triple sec, cola', 1200),
    cocktail('x20', 'Moscow Mule', 'Vodka, ginger beer, lime, copper mug', 900),
    cocktail('x21', 'Gin & Tonic', 'Gin, tonic, lime', 800),
    cocktail('x22', 'Old Fashioned', 'Bourbon, sugar, bitters, orange', 1000),
    cocktail('x23', 'Manhattan', 'Rye, sweet vermouth, bitters', 1050),
    cocktail('x24', 'Aperol Spritz', 'Aperol, prosecco, soda', 900),
    cocktail('x25', 'Caipirinha', 'Cachaça, lime, sugar', 900),
];

export const BEVERAGE_MENU: MenuItem[] = [
    ...MOCKTAIL_MENU,
    ...WINE_MENU,
    ...CHAMPAGNE_MENU,
    ...RUM_MENU,
];
