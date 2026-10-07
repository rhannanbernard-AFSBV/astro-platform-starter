import { useMemo, useState } from 'react';
import './restaurant-bill-generator.css';

type MenuItem = {
    id: number;
    name: string;
    description: string;
    category: 'Mains' | 'Starters' | 'Drinks' | 'Desserts';
    priceCents: number;
    image: string;
    popular?: boolean;
};

const menuItems: MenuItem[] = [
    {
        id: 1,
        name: 'Truffle Mushroom Pasta',
        description: 'Wild mushrooms, parmesan, truffle cream',
        category: 'Mains',
        priceCents: 2450,
        image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=700&q=85',
        popular: true,
    },
    {
        id: 2,
        name: 'Herb Roasted Salmon',
        description: 'Lemon beurre blanc, greens, baby potatoes',
        category: 'Mains',
        priceCents: 2890,
        image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=700&q=85',
    },
    {
        id: 3,
        name: 'Smash Burger',
        description: 'Aged cheddar, pickles, house sauce, fries',
        category: 'Mains',
        priceCents: 1980,
        image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=700&q=85',
        popular: true,
    },
    {
        id: 4,
        name: 'Garden Harvest Bowl',
        description: 'Quinoa, avocado, roasted vegetables, tahini',
        category: 'Mains',
        priceCents: 1760,
        image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=700&q=85',
    },
    {
        id: 5,
        name: 'Burrata & Tomatoes',
        description: 'Heirloom tomatoes, basil oil, sourdough',
        category: 'Starters',
        priceCents: 1490,
        image: 'https://images.unsplash.com/photo-1625944230945-1b7dd3b949ab?auto=format&fit=crop&w=700&q=85',
    },
    {
        id: 6,
        name: 'Crispy Calamari',
        description: 'Lemon, parsley, roasted garlic aioli',
        category: 'Starters',
        priceCents: 1380,
        image: 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=700&q=85',
    },
    {
        id: 7,
        name: 'Citrus Spritz',
        description: 'Blood orange, rosemary, sparkling water',
        category: 'Drinks',
        priceCents: 750,
        image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=700&q=85',
    },
    {
        id: 8,
        name: 'Sparkling Water',
        description: 'Chilled, 750 ml',
        category: 'Drinks',
        priceCents: 520,
        image: 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=700&q=85',
    },
    {
        id: 9,
        name: 'Basque Cheesecake',
        description: 'Burnt vanilla cheesecake, seasonal berries',
        category: 'Desserts',
        priceCents: 1080,
        image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=700&q=85',
        popular: true,
    },
    {
        id: 10,
        name: 'Chocolate Fondant',
        description: 'Warm chocolate center, sea salt ice cream',
        category: 'Desserts',
        priceCents: 1190,
        image: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=700&q=85',
    },
];

const categories = ['All', 'Mains', 'Starters', 'Drinks', 'Desserts'] as const;
type Category = (typeof categories)[number];

const money = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

function Icon({ name }: { name: 'search' | 'receipt' | 'trash' | 'check' | 'clock' }) {
    const paths = {
        search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
        receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
        trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /></>,
        check: <path d="m5 12 4 4L19 6" />,
        clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    };
    return <svg aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>;
}

export default function RestaurantBillGenerator() {
    const [category, setCategory] = useState<Category>('All');
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState<Record<number, number>>({ 1: 1, 7: 2 });
    const [billReady, setBillReady] = useState(false);

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        return menuItems.filter(
            (item) =>
                (category === 'All' || item.category === category) &&
                (!query || `${item.name} ${item.description}`.toLowerCase().includes(query)),
        );
    }, [category, search]);

    const orderItems = menuItems.filter((item) => cart[item.id]);
    const itemCount = orderItems.reduce((total, item) => total + cart[item.id], 0);
    const subtotalCents = orderItems.reduce((total, item) => total + item.priceCents * cart[item.id], 0);

    const changeQuantity = (id: number, change: number) => {
        setBillReady(false);
        setCart((current) => {
            const nextQuantity = Math.max(0, (current[id] ?? 0) + change);
            if (nextQuantity === 0) {
                const { [id]: _, ...rest } = current;
                return rest;
            }
            return { ...current, [id]: nextQuantity };
        });
    };

    const clearOrder = () => {
        setCart({});
        setBillReady(false);
    };

    return (
        <div className="bistro-app">
            <header className="topbar">
                <a className="brand" href="/" aria-label="Savory home">
                    <span className="brand-mark">S</span>
                    <span>
                        <strong>SAVORY</strong>
                        <small>Kitchen &amp; Bar</small>
                    </span>
                </a>
                <div className="service-status">
                    <span className="status-dot" />
                    <span>Open for service</span>
                    <span className="status-divider" />
                    <span>Table 12</span>
                </div>
                <div className="staff">
                    <span className="avatar">AM</span>
                    <span><strong>Alex Morgan</strong><small>Server</small></span>
                </div>
            </header>

            <main className="workspace">
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
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search menu"
                                aria-label="Search menu"
                            />
                        </label>
                    </div>

                    <div className="categories" aria-label="Menu categories">
                        {categories.map((item) => (
                            <button
                                key={item}
                                type="button"
                                className={category === item ? 'active' : ''}
                                onClick={() => setCategory(item)}
                            >
                                {item}
                            </button>
                        ))}
                    </div>

                    <div className="menu-grid">
                        {filteredItems.map((item) => {
                            const quantity = cart[item.id] ?? 0;
                            return (
                                <article className="menu-card" key={item.id}>
                                    <div className="food-image">
                                        <img src={item.image} alt="" />
                                        {item.popular && <span className="popular">Popular</span>}
                                        {quantity > 0 && <span className="in-order">{quantity} in order</span>}
                                    </div>
                                    <div className="card-copy">
                                        <p className="item-category">{item.category}</p>
                                        <h2>{item.name}</h2>
                                        <p className="description">{item.description}</p>
                                        <div className="card-footer">
                                            <strong>{money(item.priceCents)}</strong>
                                            {quantity === 0 ? (
                                                <button className="add-button" type="button" onClick={() => changeQuantity(item.id, 1)}>
                                                    <span>+</span> Add
                                                </button>
                                            ) : (
                                                <div className="stepper compact" aria-label={`${item.name} quantity`}>
                                                    <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label={`Remove one ${item.name}`}>−</button>
                                                    <span>{quantity}</span>
                                                    <button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label={`Add one ${item.name}`}>+</button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                    {filteredItems.length === 0 && <p className="empty-menu">No dishes match your search.</p>}
                </section>

                <aside className="order-panel">
                    <div className="order-title">
                        <div>
                            <p className="eyebrow">Current order</p>
                            <h2>Table 12</h2>
                        </div>
                        <button className="clear-button" type="button" onClick={clearOrder} disabled={!itemCount} aria-label="Clear order">
                            <Icon name="trash" />
                        </button>
                    </div>
                    <div className="order-meta">
                        <span><Icon name="clock" /> Dine in</span>
                        <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                    </div>

                    <div className="order-list">
                        {orderItems.length ? orderItems.map((item) => (
                            <div className="order-item" key={item.id}>
                                <div className="order-item-top">
                                    <div>
                                        <h3>{item.name}</h3>
                                        <p>{money(item.priceCents)} each</p>
                                    </div>
                                    <strong>{money(item.priceCents * cart[item.id])}</strong>
                                </div>
                                <div className="stepper" aria-label={`${item.name} quantity`}>
                                    <button type="button" onClick={() => changeQuantity(item.id, -1)} aria-label={`Remove one ${item.name}`}>−</button>
                                    <span>{cart[item.id]}</span>
                                    <button type="button" onClick={() => changeQuantity(item.id, 1)} aria-label={`Add one ${item.name}`}>+</button>
                                </div>
                            </div>
                        )) : (
                            <div className="empty-order">
                                <span><Icon name="receipt" /></span>
                                <h3>Your order is empty</h3>
                                <p>Add a dish from the menu to begin.</p>
                            </div>
                        )}
                    </div>

                    <div className="bill-summary">
                        <div><span>Subtotal</span><strong>{money(subtotalCents)}</strong></div>
                        <div className="total"><span>Total</span><strong>{money(subtotalCents)}</strong></div>
                        <p>Taxes, if applicable, are included in menu prices.</p>
                    </div>

                    <button
                        className={`generate-button ${billReady ? 'ready' : ''}`}
                        type="button"
                        disabled={!itemCount}
                        onClick={() => setBillReady(true)}
                    >
                        <Icon name={billReady ? 'check' : 'receipt'} />
                        {billReady ? 'Bill ready' : 'Generate bill'}
                        {!billReady && <span>{money(subtotalCents)}</span>}
                    </button>
                    {billReady && (
                        <div className="bill-message" role="status">
                            <strong>Bill generated successfully</strong>
                            <span>Ready to present to the guest.</span>
                        </div>
                    )}
                </aside>
            </main>
        </div>
    );
}
