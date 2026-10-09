import { useEffect, useMemo, useRef } from 'react';
import { optimizeImageUrl } from './images';
import { effectiveMenuPriceCents, isHappyHourActive } from './math';
import Price from './Price';
import { Icon } from './Icons';
import { isBeverageItem } from './statusUi';
import type { FilterCategory, MenuItem, TableOrder } from './types';
import { MENU_CATEGORIES, MENU_CATEGORY_LABELS } from './types';

const FILTERS: FilterCategory[] = ['All', ...MENU_CATEGORIES];

type Props = {
    menu: MenuItem[];
    activeTable: TableOrder;
    category: FilterCategory;
    search: string;
    isPaid: boolean;
    flashLineIds?: string[];
    onCategory: (value: FilterCategory) => void;
    onSearch: (value: string) => void;
    onAdd: (item: MenuItem) => void;
    onQuickAdd?: (item: MenuItem) => void;
};

export default function ServiceMenu({
    menu,
    activeTable,
    category,
    search,
    isPaid,
    flashLineIds = [],
    onCategory,
    onSearch,
    onAdd,
    onQuickAdd,
}: Props) {
    const searchRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    const quantities = useMemo(() => {
        const map = new Map<string, number>();
        for (const line of activeTable.lines) {
            map.set(line.menuItemId, (map.get(line.menuItemId) ?? 0) + line.quantity);
        }
        return map;
    }, [activeTable.lines]);

    const favorites = useMemo(
        () => menu.filter((item) => item.popular && !item.eightySixed).slice(0, 6),
        [menu],
    );

    const barFavorites = useMemo(
        () =>
            menu
                .filter((item) => isBeverageItem(item) && (item.popular || item.category === 'Drinks'))
                .slice(0, 10),
        [menu],
    );

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        return menu.filter(
            (item) =>
                (category === 'All' || item.category === category) &&
                (!query || `${item.name} ${item.description}`.toLowerCase().includes(query)),
        );
    }, [menu, category, search]);

    const readyFlash = flashLineIds.length > 0;

    const priceFor = (item: MenuItem) => effectiveMenuPriceCents(item);

    const addOrBlock = (item: MenuItem, quick: boolean) => {
        if (item.eightySixed || isPaid) return;
        (quick ? onQuickAdd ?? onAdd : onAdd)(item);
    };

    return (
        <section className={`menu-panel ${readyFlash ? 'ready-flash-panel' : ''}`}>
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">Yard kitchen</p>
                    <h1>What you having?</h1>
                </div>
                <label className="search">
                    <Icon name="search" />
                    <input
                        ref={searchRef}
                        type="search"
                        value={search}
                        onChange={(event) => onSearch(event.target.value)}
                        placeholder="Search menu"
                        aria-label="Search menu"
                    />
                </label>
            </div>

            {favorites.length > 0 && (
                <div className="favorites-row" aria-label="Popular favorites">
                    <p className="billing-label">Favorites</p>
                    <div className="favorites-chips">
                        {favorites.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className="favorite-chip"
                                disabled={isPaid || item.eightySixed}
                                onClick={() => addOrBlock(item, true)}
                            >
                                <span>{item.name}</span>
                                <Price cents={priceFor(item)} compact />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="bar-strip" aria-label="Bar beverages">
                <div className="bar-strip-head">
                    <p className="billing-label">Bar / beverages</p>
                    <div className="bar-strip-links">
                        <button type="button" className="ghost-text" onClick={() => onCategory('Drinks')}>
                            Drinks
                        </button>
                        <button type="button" className="ghost-text" onClick={() => onCategory('Wine')}>
                            Wine List
                        </button>
                        <button
                            type="button"
                            className="ghost-text"
                            onClick={() => onCategory('Champagne')}
                        >
                            Champagne
                        </button>
                        <button type="button" className="ghost-text" onClick={() => onCategory('Rum')}>
                            Rum
                        </button>
                    </div>
                </div>
                <div className="bar-chips">
                    {barFavorites.map((item) => {
                        const eighty = Boolean(item.eightySixed);
                        const hh = isHappyHourActive(item);
                        return (
                            <button
                                key={item.id}
                                type="button"
                                className={`bar-chip${eighty ? ' eighty-sixed' : ''}${hh ? ' happy-hour' : ''}`}
                                disabled={isPaid || eighty}
                                onClick={() => addOrBlock(item, true)}
                                title={
                                    eighty
                                        ? '86’d — out of stock'
                                        : hh
                                          ? 'Happy hour price'
                                          : undefined
                                }
                            >
                                <strong>
                                    {item.name}
                                    {eighty ? ' · 86' : hh ? ' · HH' : ''}
                                </strong>
                                <Price cents={priceFor(item)} compact />
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="categories" aria-label="Menu categories">
                {FILTERS.map((item) => (
                    <button
                        key={item}
                        type="button"
                        className={category === item ? 'active' : ''}
                        onClick={() => onCategory(item)}
                    >
                        {item === 'All' ? 'All' : MENU_CATEGORY_LABELS[item]}
                    </button>
                ))}
            </div>
            <div className="menu-grid">
                {filteredItems.map((item) => {
                    const quantity = quantities.get(item.id) ?? 0;
                    const eighty = Boolean(item.eightySixed);
                    const hh = isHappyHourActive(item);
                    return (
                        <article
                            className={`menu-card ${isBeverageItem(item) ? 'drink-card' : ''}${eighty ? ' eighty-sixed' : ''}`}
                            key={item.id}
                        >
                            <div className="food-image">
                                <img
                                    src={optimizeImageUrl(item.image)}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    width={480}
                                    height={320}
                                />
                                {item.popular && !eighty && <span className="popular">Popular</span>}
                                {eighty && <span className="eighty-badge">86</span>}
                                {hh && !eighty && <span className="hh-badge">Happy hour</span>}
                                {quantity > 0 && <span className="in-order">{quantity} in order</span>}
                            </div>
                            <div className="card-copy">
                                <p className="item-category">{MENU_CATEGORY_LABELS[item.category]}</p>
                                <h2>{item.name}</h2>
                                <p className="description">{item.description}</p>
                                {(item.origin || item.vintageYear) && (
                                    <p className="wine-meta">
                                        {[item.origin, item.vintageYear ? String(item.vintageYear) : null]
                                            .filter(Boolean)
                                            .join(' · ')}
                                    </p>
                                )}
                                <div className="card-footer">
                                    <div className="price-stack">
                                        <Price cents={priceFor(item)} />
                                        {hh && (
                                            <small className="hh-was">
                                                was <Price cents={item.priceCents} compact />
                                            </small>
                                        )}
                                    </div>
                                    {isPaid ? (
                                        <span className="paid-lock">Paid</span>
                                    ) : eighty ? (
                                        <span className="paid-lock">86’d</span>
                                    ) : (
                                        <button
                                            className="add-button"
                                            type="button"
                                            onClick={() => onAdd(item)}
                                        >
                                            <span>+</span> Add
                                        </button>
                                    )}
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
            {filteredItems.length === 0 && <p className="empty-menu">No dishes match your search.</p>}
        </section>
    );
}
