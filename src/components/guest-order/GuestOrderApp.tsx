import { useMemo, useState } from 'react';
import './guest-order.css';
import GuestOrderHeroQr from './GuestOrderHeroQr';
import {
    formatDual,
    GUEST_CATEGORIES,
    GUEST_DISHES,
    type GuestCategory,
    type GuestDish,
} from './menu';

type CartLine = { dishId: string; qty: number };

export default function GuestOrderApp() {
    const [category, setCategory] = useState<GuestCategory | 'All'>('All');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [active, setActive] = useState<GuestDish | null>(null);
    const [qty, setQty] = useState(1);

    const dishes = useMemo(() => {
        if (category === 'All') return GUEST_DISHES;
        return GUEST_DISHES.filter((dish) => dish.category === category);
    }, [category]);

    const cartCount = cart.reduce((n, line) => n + line.qty, 0);
    const cartCents = cart.reduce((sum, line) => {
        const dish = GUEST_DISHES.find((entry) => entry.id === line.dishId);
        return sum + (dish?.priceCents ?? 0) * line.qty;
    }, 0);

    const openDish = (dish: GuestDish) => {
        setActive(dish);
        setQty(1);
    };

    const addActive = () => {
        if (!active) return;
        setCart((current) => {
            const existing = current.find((line) => line.dishId === active.id);
            if (existing) {
                return current.map((line) =>
                    line.dishId === active.id ? { ...line, qty: line.qty + qty } : line,
                );
            }
            return [...current, { dishId: active.id, qty }];
        });
        setActive(null);
    };

    const scrollMenu = () => {
        document.getElementById('guest-menu')?.scrollIntoView({ behavior: 'smooth' });
    };

    return (
        <div className="guest-order-root">
            <div className="guest-shell">
                <header className="guest-top">
                    <a className="guest-brand" href="/order" aria-label="Authentic Jamaican home">
                        <span className="guest-mark" aria-hidden="true">
                            A
                        </span>
                        <span>
                            <strong>Authentic Jamaican</strong>
                            <small>Cuisine & Bar · Philipsburg</small>
                        </span>
                    </a>
                    <button type="button" className="guest-cart-chip" onClick={scrollMenu}>
                        Cart · {cartCount}
                    </button>
                </header>

                <section className="guest-hero" aria-label="Featured plate">
                    <div className="guest-hero-media" />
                    <div className="guest-hero-wood" aria-hidden="true" />
                    <div className="guest-hero-copy">
                        <p className="eyebrow">Yard kitchen · coal pot fire</p>
                        <h1>Authentic Jamaican</h1>
                        <p>Jerk chicken, rice & peas, fried plantain — order for pickup or table.</p>
                        <button type="button" className="guest-cta" onClick={scrollMenu}>
                            Order Now
                        </button>
                        <GuestOrderHeroQr />
                    </div>
                </section>

                <nav className="guest-cats" aria-label="Menu categories">
                    <button
                        type="button"
                        className={category === 'All' ? 'guest-cat active' : 'guest-cat'}
                        onClick={() => setCategory('All')}
                    >
                        All
                    </button>
                    {GUEST_CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            className={category === cat ? 'guest-cat active' : 'guest-cat'}
                            onClick={() => setCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </nav>

                <section className="guest-section" id="guest-menu">
                    <h2>{category === 'All' ? 'Yard menu' : category}</h2>
                    <div className="guest-grid">
                        {dishes.map((dish) => (
                            <button
                                key={dish.id}
                                type="button"
                                className="guest-card"
                                onClick={() => openDish(dish)}
                            >
                                <div
                                    className="guest-card-media"
                                    style={{ backgroundImage: `url('${dish.image}')` }}
                                />
                                <div className="guest-card-body">
                                    <strong>{dish.name}</strong>
                                    <span>{dish.tagline}</span>
                                    <em>{formatDual(dish.priceCents)}</em>
                                    {dish.popular && <span className="guest-badge">Popular</span>}
                                </div>
                            </button>
                        ))}
                    </div>
                </section>

                <div className="guest-footer-links">
                    <a className="guest-pos-link" href="/order/qr">
                        Table QR for guests →
                    </a>
                    <a className="guest-pos-link subtle" href="/">
                        Staff POS →
                    </a>
                </div>

                {cartCount > 0 && (
                    <div className="guest-dock" role="status">
                        <div>
                            <p>
                                {cartCount} item{cartCount === 1 ? '' : 's'} in cart
                            </p>
                            <strong>{formatDual(cartCents)}</strong>
                        </div>
                        <button type="button" onClick={scrollMenu}>
                            Order Now
                        </button>
                    </div>
                )}

                {active && (
                    <div
                        className="guest-sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-label={active.name}
                        onClick={(event) => {
                            if (event.target === event.currentTarget) setActive(null);
                        }}
                    >
                        <div className="guest-sheet-panel">
                            <button
                                type="button"
                                className="guest-close"
                                aria-label="Close"
                                onClick={() => setActive(null)}
                            >
                                ×
                            </button>
                            <div
                                className="guest-sheet-media"
                                style={{ backgroundImage: `url('${active.image}')` }}
                            />
                            <h3>{active.name}</h3>
                            <div className="price">{formatDual(active.priceCents)}</div>
                            <p>{active.description}</p>
                            <div className="guest-sheet-actions">
                                <div className="guest-qty" aria-label="Quantity">
                                    <button
                                        type="button"
                                        onClick={() => setQty((n) => Math.max(1, n - 1))}
                                    >
                                        −
                                    </button>
                                    <span>{qty}</span>
                                    <button type="button" onClick={() => setQty((n) => n + 1)}>
                                        +
                                    </button>
                                </div>
                                <button type="button" className="guest-cta" onClick={addActive}>
                                    Order Now · {formatDual(active.priceCents * qty)}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
