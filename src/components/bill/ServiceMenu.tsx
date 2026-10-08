import { useMemo } from 'react';
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
    onCategory: (value: FilterCategory) => void;
    onSearch: (value: string) => void;
    onAdd: (item: MenuItem) => void;
};

export default function ServiceMenu({
    menu,
    activeTable,
    category,
    search,
    isPaid,
    onCategory,
    onSearch,
    onAdd,
}: Props) {
    const quantities = useMemo(() => {
        const map = new Map<string, number>();
        for (const line of activeTable.lines) {
            map.set(line.menuItemId, (map.get(line.menuItemId) ?? 0) + line.quantity);
        }
        return map;
    }, [activeTable.lines]);

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        return menu.filter(
            (item) =>
                (category === 'All' || item.category === category) &&
                (!query || `${item.name} ${item.description}`.toLowerCase().includes(query)),
        );
    }, [menu, category, search]);

    return (
        <section className="menu-panel">
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">Today’s menu</p>
                    <h1>What would you like?</h1>
                </div>
                <label className="search">
                    <Icon name="search" />
                    <input
                        type="search"
                        value={search}
                        onChange={(event) => onSearch(event.target.value)}
                        placeholder="Search menu"
                        aria-label="Search menu"
                    />
                </label>
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
                        <article className="menu-card" key={item.id}>
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
