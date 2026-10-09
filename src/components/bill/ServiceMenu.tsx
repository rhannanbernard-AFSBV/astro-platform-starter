import { useEffect, useMemo, useRef } from 'react';
import { optimizeImageUrl } from './images';
import Price from './Price';
import { Icon } from './Icons';
import type { FilterCategory, MenuItem, TableOrder } from './types';
import { MENU_CATEGORIES } from './types';

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
        () => menu.filter((item) => item.popular).slice(0, 6),
        [menu],
    );

    const drinks = useMemo(() => menu.filter((item) => item.category === 'Drinks'), [menu]);

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        return menu.filter(
            (item) =>
                (category === 'All' || item.category === category) &&
                (!query || `${item.name} ${item.description}`.toLowerCase().includes(query)),
        );
    }, [menu, category, search]);

    const readyFlash = flashLineIds.length > 0;

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
                                disabled={isPaid}
                                onClick={() => (onQuickAdd ?? onAdd)(item)}
                            >
                                <span>{item.name}</span>
                                <Price cents={item.priceCents} compact />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="bar-strip" aria-label="Bar beverages">
                <div className="bar-strip-head">
                    <p className="billing-label">Bar / beverages</p>
                    <button type="button" className="ghost-text" onClick={() => onCategory('Drinks')}>
                        View all drinks
                    </button>
                </div>
                <div className="bar-chips">
                    {drinks.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="bar-chip"
                            disabled={isPaid}
                            onClick={() => (onQuickAdd ?? onAdd)(item)}
                        >
                            <strong>{item.name}</strong>
                            <Price cents={item.priceCents} compact />
                        </button>
                    ))}
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
                        {item}
                    </button>
                ))}
            </div>
            <div className="menu-grid">
                {filteredItems.map((item) => {
                    const quantity = quantities.get(item.id) ?? 0;
                    return (
                        <article
                            className={`menu-card ${item.category === 'Drinks' ? 'drink-card' : ''}`}
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
                                {item.popular && <span className="popular">Popular</span>}
                                {quantity > 0 && <span className="in-order">{quantity} in order</span>}
                            </div>
                            <div className="card-copy">
                                <p className="item-category">{item.category}</p>
                                <h2>{item.name}</h2>
                                <p className="description">{item.description}</p>
                                <div className="card-footer">
                                    <Price cents={item.priceCents} />
                                    {isPaid ? (
                                        <span className="paid-lock">Paid</span>
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
