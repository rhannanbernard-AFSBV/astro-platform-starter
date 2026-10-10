import { useEffect, useMemo, useState } from 'react';
import './guest-order.css';
import GuestOrderHeroQr from './GuestOrderHeroQr';
import {
    fetchGuestMenu,
    fetchGuestOrderStatus,
    isGuestApiConfigured,
    placeGuestOrder,
    type GuestFulfillment,
    type GuestOrderStatus,
} from './guestApi';
import {
    formatDual,
    GUEST_CATEGORIES,
    PHASE_LABELS,
    type GuestCategory,
    type GuestDish,
} from './menu';

type CartLine = { dishId: string; qty: number };

export default function GuestOrderApp() {
    const [dishes, setDishes] = useState<GuestDish[]>([]);
    const [menuSource, setMenuSource] = useState<'pos' | 'fallback' | 'static'>('static');
    const [category, setCategory] = useState<GuestCategory | 'All'>('All');
    const [cart, setCart] = useState<CartLine[]>([]);
    const [active, setActive] = useState<GuestDish | null>(null);
    const [qty, setQty] = useState(1);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [fulfillment, setFulfillment] = useState<GuestFulfillment>('table');
    const [tableLabel, setTableLabel] = useState('');
    const [guestName, setGuestName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [order, setOrder] = useState<GuestOrderStatus | null>(null);

    useEffect(() => {
        let cancelled = false;
        void fetchGuestMenu().then((result) => {
            if (cancelled) return;
            setDishes(result.dishes);
            setMenuSource(result.source);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!order?.token || order.token.startsWith('go_demo_')) return;
        const timer = window.setInterval(() => {
            void fetchGuestOrderStatus(order.token).then((next) => {
                if (next) setOrder(next);
            });
        }, 4000);
        return () => window.clearInterval(timer);
    }, [order?.token]);

    const categories = useMemo(() => {
        const fromDishes = Array.from(new Set(dishes.map((d) => d.category)));
        const preferred = GUEST_CATEGORIES.filter((c) => fromDishes.includes(c));
        const extras = fromDishes.filter((c) => !GUEST_CATEGORIES.includes(c));
        return [...preferred, ...extras];
    }, [dishes]);

    const visible = useMemo(() => {
        if (category === 'All') return dishes;
        return dishes.filter((dish) => dish.category === category);
    }, [category, dishes]);

    const cartCount = cart.reduce((n, line) => n + line.qty, 0);
    const cartCents = cart.reduce((sum, line) => {
        const dish = dishes.find((entry) => entry.id === line.dishId);
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

    const openCheckout = () => {
        setError(null);
        setCheckoutOpen(true);
    };

    const submitOrder = async () => {
        setError(null);
        if (fulfillment === 'table' && !tableLabel.trim()) {
            setError('Enter your table number.');
            return;
        }
        if (fulfillment === 'pickup' && !guestName.trim()) {
            setError('Enter a name for pickup.');
            return;
        }
        if (!cart.length) {
            setError('Cart is empty.');
            return;
        }
        setSubmitting(true);
        try {
            const placed = await placeGuestOrder({
                fulfillment,
                tableLabel: tableLabel.trim() || undefined,
                guestName: guestName.trim() || undefined,
                lines: cart.map((line) => ({ menuItemId: line.dishId, quantity: line.qty })),
            });
            setOrder(placed);
            setCart([]);
            setCheckoutOpen(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not place order');
        } finally {
            setSubmitting(false);
        }
    };

    if (order) {
        return (
            <div className="guest-order-root">
                <div className="guest-shell">
                    <header className="guest-top">
                        <a className="guest-brand" href="/order">
                            <span className="guest-mark" aria-hidden="true">
                                A
                            </span>
                            <span>
                                <strong>Order status</strong>
                                <small>{order.orderNumber || order.token.slice(0, 12)}</small>
                            </span>
                        </a>
                    </header>
                    <section className="guest-status" aria-live="polite">
                        <p className="eyebrow">
                            {order.fulfillment === 'pickup' ? 'Pickup' : order.label}
                        </p>
                        <h1>{PHASE_LABELS[order.phase] || order.phase}</h1>
                        <p className="guest-status-pay">
                            Pay at the counter when you pick up or before you leave.
                        </p>
                        {!isGuestApiConfigured() && (
                            <p className="guest-status-demo">
                                Demo mode — kitchen will not see this order until{' '}
                                <code>PUBLIC_POS_API_URL</code> is set.
                            </p>
                        )}
                        <ol className="guest-phase-rail" aria-label="Progress">
                            {['received', 'preparing', 'ready', 'paid'].map((phase) => (
                                <li
                                    key={phase}
                                    className={
                                        phase === order.phase
                                            ? 'active'
                                            : ['received', 'preparing', 'ready', 'paid'].indexOf(
                                                    phase,
                                                ) <
                                                ['received', 'preparing', 'ready', 'paid'].indexOf(
                                                    order.phase,
                                                )
                                              ? 'done'
                                              : ''
                                    }
                                >
                                    {PHASE_LABELS[phase]}
                                </li>
                            ))}
                        </ol>
                        <ul className="guest-status-lines">
                            {order.lines.map((line) => (
                                <li key={line.id}>
                                    <span>
                                        {line.quantity}× {line.name}
                                    </span>
                                    <em>{line.status}</em>
                                </li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            className="guest-cta"
                            onClick={() => {
                                setOrder(null);
                                scrollMenu();
                            }}
                        >
                            Order more
                        </button>
                    </section>
                </div>
            </div>
        );
    }

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
                    <button type="button" className="guest-cart-chip" onClick={openCheckout}>
                        Cart · {cartCount}
                    </button>
                </header>

                {menuSource !== 'static' && (
                    <p className="guest-live-banner">
                        {menuSource === 'pos'
                            ? 'Live menu from the kitchen'
                            : 'Guest menu ready · connect staff POS for live tickets'}
                    </p>
                )}
                {!isGuestApiConfigured() && (
                    <p className="guest-live-banner warn">
                        Demo catalog — set PUBLIC_POS_API_URL so Order Now fires kitchen tickets
                    </p>
                )}

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
                    {categories.map((cat) => (
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
                        {visible.map((dish) => (
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
                        <button type="button" onClick={openCheckout}>
                            Checkout
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
                                    Add · {formatDual(active.priceCents * qty)}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {checkoutOpen && (
                    <div
                        className="guest-sheet"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Checkout"
                        onClick={(event) => {
                            if (event.target === event.currentTarget) setCheckoutOpen(false);
                        }}
                    >
                        <div className="guest-sheet-panel guest-checkout">
                            <button
                                type="button"
                                className="guest-close"
                                aria-label="Close"
                                onClick={() => setCheckoutOpen(false)}
                            >
                                ×
                            </button>
                            <h3>Checkout</h3>
                            <p className="guest-checkout-total">{formatDual(cartCents)}</p>
                            <div className="guest-fulfill">
                                <button
                                    type="button"
                                    className={fulfillment === 'table' ? 'active' : ''}
                                    onClick={() => setFulfillment('table')}
                                >
                                    At table
                                </button>
                                <button
                                    type="button"
                                    className={fulfillment === 'pickup' ? 'active' : ''}
                                    onClick={() => setFulfillment('pickup')}
                                >
                                    Pickup
                                </button>
                            </div>
                            {fulfillment === 'table' ? (
                                <label className="guest-field">
                                    Table number
                                    <input
                                        value={tableLabel}
                                        onChange={(e) => setTableLabel(e.target.value)}
                                        placeholder="e.g. 12"
                                        inputMode="numeric"
                                        autoComplete="off"
                                    />
                                </label>
                            ) : (
                                <label className="guest-field">
                                    Name for pickup
                                    <input
                                        value={guestName}
                                        onChange={(e) => setGuestName(e.target.value)}
                                        placeholder="Your name"
                                        autoComplete="name"
                                    />
                                </label>
                            )}
                            <p className="guest-pay-note">Pay at the counter — no card required in-app.</p>
                            {error && <p className="guest-error">{error}</p>}
                            <button
                                type="button"
                                className="guest-cta"
                                disabled={submitting}
                                onClick={() => void submitOrder()}
                            >
                                {submitting ? 'Sending…' : 'Send to kitchen'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
