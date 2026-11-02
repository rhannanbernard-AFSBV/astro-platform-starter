/**
 * Menu intelligence helper — GPT-4o via POS API when available,
 * professional local fallback for SPA demo (no money math).
 */

import { isServerMode, type MenuEnrichmentPayload } from './posApi';
import { isBeverageCategory } from './statusUi';
import type { MenuCategory, MenuItem } from './types';

export type MenuEnrichment = MenuEnrichmentPayload;

type EnrichInput = Pick<
    MenuItem,
    'name' | 'category' | 'description' | 'origin' | 'vintageYear'
>;

function foodIngredients(name: string, category: MenuCategory): string {
    const lower = name.toLowerCase();
    if (lower.includes('jerk')) {
        return 'Chicken thighs, scotch bonnet, allspice (pimento), thyme, garlic, ginger, scallion, soy, brown sugar, lime; served with festival or rice & peas.';
    }
    if (lower.includes('ackee')) {
        return 'Ackee, saltfish (cod), onion, tomato, scotch bonnet, thyme, black pepper, scallion; sides: callaloo, boiled green banana, avocado.';
    }
    if (lower.includes('curry goat')) {
        return 'Goat, curry powder, onion, garlic, thyme, scotch bonnet, potato, coconut milk or stock; white rice.';
    }
    if (lower.includes('oxtail')) {
        return 'Oxtail, butter beans, broad thyme, onion, garlic, browning, allspice, scotch bonnet, rich gravy.';
    }
    if (lower.includes('festival') || lower.includes('plantain')) {
        return 'Cornmeal, flour, sugar, baking powder, salt, water/milk for festival; ripe plantain, oil for frying.';
    }
    if (lower.includes('callaloo')) {
        return 'Callaloo (amaranth/dasheen leaf), onion, garlic, scotch bonnet, coconut oil, salt, black pepper.';
    }
    if (lower.includes('breadfruit')) {
        return 'Mature breadfruit, salt, butter or coconut oil; coal-roasted or oven-finished.';
    }
    if (lower.includes('mango') || lower.includes('julie')) {
        return 'Ripe Julie mango, optional lime pinch and chili salt.';
    }
    if (lower.includes('pudding')) {
        return 'Sweet potato, coconut milk, brown sugar, nutmeg, cinnamon, vanilla, butter.';
    }
    if (lower.includes('gizzada')) {
        return 'Flour pastry shell, grated coconut, brown sugar, nutmeg, ginger, vanilla.';
    }
    if (category === 'Desserts') {
        return `${name}: house pastry or pudding base, sugar, spice, coconut milk where traditional.`;
    }
    return `${name}: kitchen-prep proteins or produce, aromatics (onion, garlic, thyme), scotch bonnet to taste, salt. Confirm allergen notes with the chef.`;
}

const BOTTLE_MARKERS = [
    'appleton',
    'wray',
    'myers',
    'mount gay',
    'diplom',
    'red stripe',
    'dragon stout',
    'moët',
    'moet',
    'veuve',
    'dom pérignon',
    'dom perignon',
    'ruinart',
    'nicolas feuillatte',
    'cloudy bay',
    'kim crawford',
    'château',
    'chateau',
    'trapiche',
    'frescobaldi',
    'josh cellars',
    'villa maria',
    'yellow tail',
];

function drinkIngredients(item: EnrichInput): string {
    const lower = item.name.toLowerCase();
    if (item.category === 'Wine' || item.category === 'Champagne') {
        return `${item.name}${item.origin ? ` · ${item.origin}` : ''}${item.vintageYear ? ` · ${item.vintageYear}` : ''}. Serve as bottled wine/champagne — no mixers. Chill white/sparkling; cellar reds as style requires.`;
    }
    if (BOTTLE_MARKERS.some((marker) => lower.includes(marker))) {
        return `${item.name}${item.origin ? ` from ${item.origin}` : ''}. Pour neat, over ice, or build into house cocktails with a jigger.`;
    }
    if (lower.includes('mojito') || lower.includes('nojito')) {
        return 'Fresh mint, lime, sugar or simple syrup, soda water; rum only if alcoholic version.';
    }
    if (lower.includes('piña') || lower.includes('pina')) {
        return 'Pineapple juice, coconut cream, ice; white rum if alcoholic.';
    }
    if (lower.includes('punch') && item.category === 'Rum') {
        return 'Aged rum blend, pineapple, orange, guava or passion, lime, grenadine, grated nutmeg.';
    }
    if (lower.includes('sorrel')) {
        return 'Dried sorrel (hibiscus), ginger, clove, cinnamon, sugar, water, ice.';
    }
    if (lower.includes('margarita')) {
        return 'Lime juice, orange liqueur or NA orange, agave/simple; tequila if alcoholic; salt rim optional.';
    }
    if (lower.includes('espresso martini')) {
        return 'Fresh espresso, coffee liqueur, vodka, simple syrup, ice.';
    }
    return `${item.name}: bar-standard mixers and ice. Use house recipes; measure pours — never invent ABV or prices.`;
}

function prepGuideFor(item: EnrichInput): string {
    const cat = item.category;
    const name = item.name;

    if (cat === 'Wine') {
        return `Service: Present the bottle label (${item.origin ?? 'listed origin'}${item.vintageYear ? `, ${item.vintageYear}` : ''}). Open tableside if requested. White/rosé: chill 7–10°C; red: 16–18°C. Pour a tasting ounce, then fill to ~⅓–½ glass. Do not shake or ice wine unless guest asks for it on ice.`;
    }
    if (cat === 'Champagne') {
        return `Chill bottle to 6–8°C. Open with controlled cage release — towel over cork, twist bottle not cork. Pour down the side of a flute or tulip to preserve mousse. Top once foam settles. Keep rest of bottle in ice bucket.`;
    }
    if (cat === 'Rum' && (name.toLowerCase().includes('appleton') || name.toLowerCase().includes('wray') || name.toLowerCase().includes('myers') || name.toLowerCase().includes('mount') || name.toLowerCase().includes('diplom'))) {
        return `Spirit service: Confirm neat, rocks, or cocktail. Use a jigger for every pour. For overproof (e.g. Wray & Nephew), warn guests and never free-pour into open flame. Wipe pour spout; present bottle if guest asks for the brand.`;
    }
    if (isBeverageCategory(cat)) {
        return `Build ${name} in a clean mixing glass or shaker. Measure spirits and juices with a jigger. Shake with ice 10–12 seconds (or stir spirit-forward drinks 20–30 seconds). Double-strain into the correct glass, garnish as house standard, wipe rim, and serve immediately on a napkin.`;
    }
    if (cat === 'Mains' || cat === 'Starters') {
        return `Prep ${name} to ticket course-fire timing. Hold cold mise en place; finish on the plancha/coal pot to order. Plate hot food hot — wipe rim, check garnish, call the pass only when the full plate matches the ticket modifiers (heat, side swap, prep notes).`;
    }
    return `Prepare ${name} to house recipe. Follow ticket modifiers exactly. Taste for seasoning before plating; keep allergen awareness for shared fryers and prep boards.`;
}

function pairingFor(item: EnrichInput): string {
    const cat = item.category;
    const lower = item.name.toLowerCase();

    if (cat === 'Wine') {
        if (lower.includes('sauvignon') || lower.includes('riesling')) {
            return 'Pairs with: jerk chicken (mild–yard), festival & sweet plantain, callaloo, ceviche-style starters, and fresh Julie mango. Bright acidity cuts spice and fried sides.';
        }
        if (lower.includes('pinot')) {
            return 'Pairs with: curry goat, roasted breadfruit, jerk (not extra bonnet), and lighter oxtail portions. Soft tannins love thyme and allspice.';
        }
        if (lower.includes('chardonnay')) {
            return 'Pairs with: ackee & saltfish, fried festival, buttered breadfruit, and creamy callaloo. Oak-kissed styles hug coconut and fried sides.';
        }
        if (lower.includes('malbec') || lower.includes('cabernet') || lower.includes('shiraz') || lower.includes('chianti')) {
            return 'Pairs with: oxtail stew, curry goat, jerk chicken (yard hot), and grilled meats. Structure stands up to browning gravy and scotch bonnet.';
        }
        return `Pairs with Authentic Jamaican Cuisine mains — match body to spice: lighter whites with festival/ackee; fuller reds with oxtail and curry goat. Ask the guest’s heat preference before pouring.`;
    }
    if (cat === 'Champagne') {
        return 'Pairs with: festival & sweet plantain, roasted breadfruit, ackee & saltfish, and celebration toasts before heavy stews. Bubbles refresh the palate between spicy courses.';
    }
    if (cat === 'Rum' || cat === 'Drinks') {
        if (lower.includes('punch') || lower.includes('piña') || lower.includes('colada')) {
            return 'Serve with spicy mains (jerk, curry) as a cooling counterpoint, or as a standalone bar round.';
        }
        if (lower.includes('mojito') || lower.includes('sorrel') || lower.includes('ginger')) {
            return 'Excellent with fried starters (festival, plantain) and as a mid-meal refresher beside jerk.';
        }
        return 'Bar round: enjoy before the meal or alongside lighter starters; rich cocktails also close after dessert.';
    }
    if (cat === 'Mains') {
        return 'Beverage pairing: offer house rum punch or a crisp white with spice; fuller red or dark stout with oxtail/curry. Non-alc: sorrel punch or ginger cooler.';
    }
    if (cat === 'Desserts') {
        return 'Pairs with: Diplomático neat, espresso martini, or sorrel punch. Avoid pouring heavy reds over sweet potato pudding.';
    }
    return 'Suggest a drink from Drinks / Wine List / Rum based on spice level and guest preference.';
}

function shortDescription(item: EnrichInput, ingredients: string): string {
    if (item.description?.trim()) return item.description.trim();
    if (item.category === 'Wine') {
        return `${item.name}${item.origin ? ` · ${item.origin}` : ''}${item.vintageYear ? ` · ${item.vintageYear}` : ''}.`;
    }
    const first = ingredients.split(';')[0] ?? ingredients;
    return first.length > 120 ? `${first.slice(0, 117)}…` : first;
}

/** Offline professional copy when GPT-4o is unavailable. */
export function localEnrichMenuItem(item: EnrichInput): MenuEnrichment {
    const ingredients = isBeverageCategory(item.category)
        ? drinkIngredients(item)
        : foodIngredients(item.name, item.category);
    const prepGuide = prepGuideFor(item);
    const pairingNotes = pairingFor(item);
    return {
        description: shortDescription(item, ingredients),
        prepGuide,
        pairingNotes,
        ingredients,
        source: 'local',
    };
}

export async function enrichMenuItem(item: EnrichInput): Promise<MenuEnrichment> {
    if (isServerMode()) {
        try {
            const { enrichMenuItemRemote } = await import('./posApi');
            return await enrichMenuItemRemote(item);
        } catch {
            // fall through to local
        }
    }
    return localEnrichMenuItem(item);
}

/** Apply AI fields onto a menu item without wiping existing copy unless empty. */
export function applyEnrichment(
    item: MenuItem,
    enrichment: MenuEnrichment,
    opts: { overwrite?: boolean } = {},
): MenuItem {
    const overwrite = opts.overwrite === true;
    return {
        ...item,
        description:
            overwrite || !item.description?.trim()
                ? enrichment.description
                : item.description,
        prepGuide:
            overwrite || !item.prepGuide?.trim() ? enrichment.prepGuide : item.prepGuide,
        pairingNotes:
            overwrite || !item.pairingNotes?.trim()
                ? enrichment.pairingNotes
                : item.pairingNotes,
        ingredients:
            overwrite || !item.ingredients?.trim()
                ? enrichment.ingredients
                : item.ingredients,
    };
}
