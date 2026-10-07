import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './restaurant-bill-generator.css';
import { createId, createTable, DEFAULT_TAX_PERCENT, PLACEHOLDER_IMAGE } from './bill/defaults';
import {
    buildSnapshot,
    computeBill,
    decodeSnapshot,
    encodeSnapshot,
    money,
    tipLabel,
} from './bill/math';
import { loadState, saveState } from './bill/storage';
import {
    MENU_CATEGORIES,
    TIP_PRESETS,
    type BillSnapshot,
    type FilterCategory,
    type MenuCategory,
    type MenuItem,
    type PersistedState,
    type TableOrder,
    type TipPreset,
} from './bill/types';

const FILTERS: FilterCategory[] = ['All', ...MENU_CATEGORIES];

type ViewMode = 'service' | 'admin';

function Icon({
    name,
}: {
    name: 'search' | 'receipt' | 'trash' | 'check' | 'clock' | 'print' | 'share' | 'download' | 'users' | 'settings' | 'plus' | 'close';
}) {
    const paths: Record<string, ReactNode> = {
        search: (
            <>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
            </>
        ),
        receipt: (
            <>
                <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
                <path d="M9 8h6M9 12h6" />
            </>
        ),
        trash: (
            <>
                <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
            </>
        ),
        check: <path d="m5 12 4 4L19 6" />,
        clock: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </>
        ),
        print: (
            <>
                <path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="13" width="12" height="8" />
            </>
        ),
        share: (
            <>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
            </>
        ),
        download: (
            <>
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
            </>
        ),
        users: (
            <>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </>
        ),
        settings: (
            <>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
            </>
        ),
        plus: <path d="M12 5v14M5 12h14" />,
        close: <path d="M18 6 6 18M6 6l12 12" />,
    };
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
            {paths[name]}
        </svg>
    );
}

function emptyMenuForm(): Omit<MenuItem, 'id'> {
    return {
        name: '',
        description: '',
        category: 'Mains',
        priceCents: 0,
        image: PLACEHOLDER_IMAGE,
        popular: false,
    };
}

function ReceiptView({
    snapshot,
    onClose,
    shareFeedback,
    onShareFeedback,
}: {
    snapshot: BillSnapshot;
    onClose: () => void;
    shareFeedback: string | null;
    onShareFeedback: (message: string) => void;
}) {
    const printReceipt = () => window.print();

    const downloadReceipt = () => {
        const lines = [
            snapshot.restaurant,
            snapshot.tableLabel,
            `Generated: ${new Date(snapshot.generatedAt).toLocaleString()}`,
            `Status: ${snapshot.status}`,
            '',
            ...snapshot.items.map(
                (item) =>
                    `${item.quantity}x ${item.name}${item.guestName ? ` (${item.guestName})` : ''}  ${money(item.lineTotalCents)}`,
            ),
            '',
            `Subtotal: ${money(snapshot.subtotalCents)}`,
            snapshot.taxEnabled
                ? `Tax (${snapshot.taxPercent}%): ${money(snapshot.taxCents)}`
                : 'Tax: —',
            `Tip (${snapshot.tipPercent}%): ${money(snapshot.tipCents)}`,
            `Total: ${money(snapshot.totalCents)}`,
        ];
        if (snapshot.guests.filter((guest) => guest.subtotalCents > 0).length > 1) {
            lines.push('', 'Split check:');
            snapshot.guests
                .filter((guest) => guest.subtotalCents > 0)
                .forEach((guest) => {
                    lines.push(`${guest.name}: ${money(guest.totalCents)}`);
                });
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${snapshot.tableLabel.replace(/\s+/g, '-').toLowerCase()}-receipt.txt`;
        anchor.click();
        URL.revokeObjectURL(url);
        onShareFeedback('Receipt downloaded. Use Print / PDF to save a PDF copy.');
    };

    const shareReceipt = async () => {
        const encoded = encodeSnapshot(snapshot);
        const url = `${window.location.origin}${window.location.pathname}#bill=${encoded}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: `${snapshot.restaurant} — ${snapshot.tableLabel}`,
                    text: `Bill total ${money(snapshot.totalCents)}`,
                    url,
                });
                onShareFeedback('Share sheet opened.');
            } else {
                await navigator.clipboard.writeText(url);
                onShareFeedback('Shareable bill link copied to clipboard.');
            }
        } catch {
            try {
                await navigator.clipboard.writeText(url);
                onShareFeedback('Shareable bill link copied to clipboard.');
            } catch {
                onShareFeedback('Could not share this bill automatically.');
            }
        }
    };

    return (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Receipt">
            <div className="receipt-sheet">
                <div className="receipt-toolbar no-print">
                    <div>
                        <p className="eyebrow">Guest receipt</p>
                        <h2>{snapshot.tableLabel}</h2>
                    </div>
                    <div className="receipt-actions">
                        <button type="button" onClick={printReceipt}>
                            <Icon name="print" /> Print / PDF
                        </button>
                        <button type="button" onClick={downloadReceipt}>
                            <Icon name="download" /> Download
                        </button>
                        <button type="button" onClick={shareReceipt}>
                            <Icon name="share" /> Share link
                        </button>
                        <button type="button" className="ghost" onClick={onClose} aria-label="Close receipt">
                            <Icon name="close" />
                        </button>
                    </div>
                </div>
                {shareFeedback && <p className="share-feedback no-print">{shareFeedback}</p>}

                <div className="receipt-body" id="printable-receipt">
                    <header>
                        <strong>{snapshot.restaurant}</strong>
                        <span>{snapshot.tableLabel}</span>
                        <span>{new Date(snapshot.generatedAt).toLocaleString()}</span>
                        <span className={`status-chip ${snapshot.status}`}>{snapshot.status}</span>
                    </header>
                    <ul>
                        {snapshot.items.map((item, index) => (
                            <li key={`${item.name}-${index}`}>
                                <div>
                                    <strong>
                                        {item.quantity}× {item.name}
                                    </strong>
                                    {item.guestName && <small>{item.guestName}</small>}
                                </div>
                                <span>{money(item.lineTotalCents)}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="receipt-totals">
                        <div>
                            <span>Subtotal</span>
                            <strong>{money(snapshot.subtotalCents)}</strong>
                        </div>
                        <div>
                            <span>{snapshot.taxEnabled ? `Tax (${snapshot.taxPercent}%)` : 'Tax'}</span>
                            <strong>{snapshot.taxEnabled ? money(snapshot.taxCents) : '—'}</strong>
                        </div>
                        <div>
                            <span>Tip ({snapshot.tipPercent}%)</span>
                            <strong>{money(snapshot.tipCents)}</strong>
                        </div>
                        <div className="grand">
                            <span>Total</span>
                            <strong>{money(snapshot.totalCents)}</strong>
                        </div>
                    </div>
                    {snapshot.guests.filter((guest) => guest.subtotalCents > 0).length > 1 && (
                        <div className="split-block">
                            <p>Split check</p>
                            {snapshot.guests
                                .filter((guest) => guest.subtotalCents > 0)
                                .map((guest) => (
                                    <div key={guest.name}>
                                        <span>{guest.name}</span>
                                        <strong>{money(guest.totalCents)}</strong>
                                    </div>
                                ))}
                        </div>
                    )}
                    <footer>Thank you for dining with us.</footer>
                </div>
            </div>
        </div>
    );
}

export default function RestaurantBillGenerator() {
    const [hydrated, setHydrated] = useState(false);
    const [state, setState] = useState<PersistedState>(() => loadState());
    const [view, setView] = useState<ViewMode>('service');
    const [category, setCategory] = useState<FilterCategory>('All');
    const [search, setSearch] = useState('');
    const [receipt, setReceipt] = useState<BillSnapshot | null>(null);
    const [shareFeedback, setShareFeedback] = useState<string | null>(null);
    const [menuForm, setMenuForm] = useState(emptyMenuForm());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTableLabel, setNewTableLabel] = useState('');

    useEffect(() => {
        const initial = loadState();
        setState(initial);
        setHydrated(true);

        const hash = window.location.hash;
        if (hash.startsWith('#bill=')) {
            const snapshot = decodeSnapshot(hash.slice(6));
            if (snapshot) setReceipt(snapshot);
        }
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        saveState(state);
    }, [state, hydrated]);

    const activeTable = state.tables.find((table) => table.id === state.activeTableId) ?? state.tables[0];
    const menuById = useMemo(() => new Map(state.menu.map((item) => [item.id, item])), [state.menu]);
    const bill = useMemo(() => computeBill(activeTable, state.menu), [activeTable, state.menu]);

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        return state.menu.filter(
            (item) =>
                (category === 'All' || item.category === category) &&
                (!query || `${item.name} ${item.description}`.toLowerCase().includes(query)),
        );
    }, [state.menu, category, search]);

    const itemCount = activeTable.lines.reduce((total, line) => total + line.quantity, 0);
    const isPaid = activeTable.status === 'paid';

    const updateActiveTable = (updater: (table: TableOrder) => TableOrder) => {
        setState((current) => ({
            ...current,
            tables: current.tables.map((table) =>
                table.id === current.activeTableId ? updater(table) : table,
            ),
        }));
    };

    const changeQuantity = (menuItemId: string, change: number) => {
        if (isPaid) return;
        updateActiveTable((table) => {
            const existing = table.lines.find((line) => line.menuItemId === menuItemId);
            let lines = [...table.lines];
            if (!existing && change > 0) {
                lines.push({
                    menuItemId,
                    quantity: change,
                    guestId: table.guests[0]?.id ?? null,
                });
            } else if (existing) {
                const nextQuantity = existing.quantity + change;
                lines =
                    nextQuantity <= 0
                        ? lines.filter((line) => line.menuItemId !== menuItemId)
                        : lines.map((line) =>
                              line.menuItemId === menuItemId ? { ...line, quantity: nextQuantity } : line,
                          );
            }
            return { ...table, lines, billGeneratedAt: null };
        });
    };

    const assignGuest = (menuItemId: string, guestId: string) => {
        if (isPaid) return;
        updateActiveTable((table) => ({
            ...table,
            billGeneratedAt: null,
            lines: table.lines.map((line) =>
                line.menuItemId === menuItemId ? { ...line, guestId } : line,
            ),
        }));
    };

    const clearOrder = () => {
        if (isPaid) return;
        updateActiveTable((table) => ({
            ...table,
            lines: [],
            billGeneratedAt: null,
        }));
    };

    const setTipPreset = (preset: TipPreset) => {
        if (isPaid) return;
        updateActiveTable((table) => ({
            ...table,
            tipPreset: preset,
            tipCustomPercent: preset === 'custom' ? table.tipCustomPercent : preset,
            billGeneratedAt: null,
        }));
    };

    const generateBill = () => {
        if (!itemCount || isPaid) return;
        const generatedAt = new Date().toISOString();
        updateActiveTable((table) => ({ ...table, billGeneratedAt: generatedAt }));
        const snapshot = buildSnapshot({ ...activeTable, billGeneratedAt: generatedAt }, state.menu);
        setReceipt(snapshot);
        setShareFeedback(null);
    };

    const markPaid = () => {
        if (!itemCount) return;
        const paidAt = new Date().toISOString();
        updateActiveTable((table) => ({
            ...table,
            status: 'paid',
            paidAt,
            billGeneratedAt: table.billGeneratedAt ?? paidAt,
        }));
        const snapshot = buildSnapshot(
            {
                ...activeTable,
                status: 'paid',
                paidAt,
                billGeneratedAt: activeTable.billGeneratedAt ?? paidAt,
            },
            state.menu,
        );
        setReceipt(snapshot);
    };

    const reopenTable = () => {
        updateActiveTable((table) => ({
            ...table,
            status: 'open',
            paidAt: null,
            billGeneratedAt: null,
            lines: [],
        }));
    };

    const addGuest = () => {
        if (isPaid) return;
        updateActiveTable((table) => ({
            ...table,
            guests: [
                ...table.guests,
                { id: createId('guest'), name: `Guest ${table.guests.length + 1}` },
            ],
        }));
    };

    const renameGuest = (guestId: string, name: string) => {
        updateActiveTable((table) => ({
            ...table,
            guests: table.guests.map((guest) => (guest.id === guestId ? { ...guest, name } : guest)),
        }));
    };

    const removeGuest = (guestId: string) => {
        if (isPaid) return;
        updateActiveTable((table) => {
            if (table.guests.length <= 1) return table;
            const fallback = table.guests.find((guest) => guest.id !== guestId)?.id ?? null;
            return {
                ...table,
                guests: table.guests.filter((guest) => guest.id !== guestId),
                lines: table.lines.map((line) =>
                    line.guestId === guestId ? { ...line, guestId: fallback } : line,
                ),
                billGeneratedAt: null,
            };
        });
    };

    const switchTable = (tableId: string) => {
        setState((current) => ({ ...current, activeTableId: tableId }));
        setReceipt(null);
    };

    const addTable = () => {
        const label = newTableLabel.trim() || `Table ${state.tables.length + 1}`;
        const table = createTable(label, DEFAULT_TAX_PERCENT);
        setState((current) => ({
            ...current,
            tables: [...current.tables, table],
            activeTableId: table.id,
        }));
        setNewTableLabel('');
    };

    const saveMenuItem = () => {
        if (!menuForm.name.trim() || menuForm.priceCents < 0) return;
        if (editingId) {
            setState((current) => ({
                ...current,
                menu: current.menu.map((item) =>
                    item.id === editingId
                        ? {
                              ...item,
                              ...menuForm,
                              name: menuForm.name.trim(),
                              description: menuForm.description.trim(),
                          }
                        : item,
                ),
            }));
        } else {
            const item: MenuItem = {
                id: createId('menu'),
                ...menuForm,
                name: menuForm.name.trim(),
                description: menuForm.description.trim(),
            };
            setState((current) => ({ ...current, menu: [...current.menu, item] }));
        }
        setMenuForm(emptyMenuForm());
        setEditingId(null);
    };

    const editMenuItem = (item: MenuItem) => {
        setEditingId(item.id);
        setMenuForm({
            name: item.name,
            description: item.description,
            category: item.category,
            priceCents: item.priceCents,
            image: item.image,
            popular: Boolean(item.popular),
        });
        setView('admin');
    };

    const deleteMenuItem = (id: string) => {
        setState((current) => ({
            ...current,
            menu: current.menu.filter((item) => item.id !== id),
            tables: current.tables.map((table) => ({
                ...table,
                lines: table.lines.filter((line) => line.menuItemId !== id),
            })),
        }));
        if (editingId === id) {
            setEditingId(null);
            setMenuForm(emptyMenuForm());
        }
    };

    const shareFromToolbar = async () => {
        if (!itemCount) return;
        const generatedAt = activeTable.billGeneratedAt ?? new Date().toISOString();
        if (!activeTable.billGeneratedAt) {
            updateActiveTable((table) => ({ ...table, billGeneratedAt: generatedAt }));
        }
        const snapshot = buildSnapshot({ ...activeTable, billGeneratedAt: generatedAt }, state.menu);
        const encoded = encodeSnapshot(snapshot);
        const url = `${window.location.origin}${window.location.pathname}#bill=${encoded}`;
        try {
            await navigator.clipboard.writeText(url);
            setShareFeedback('Shareable bill link copied to clipboard.');
        } catch {
            setShareFeedback('Could not copy link. Open the receipt and try again.');
        }
        setReceipt(snapshot);
    };

    if (!hydrated) {
        return <div className="bistro-app loading-shell">Loading Savory…</div>;
    }

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
                    <span className={`status-dot ${isPaid ? 'paid' : ''}`} />
                    <span>{isPaid ? 'Table paid' : 'Open for service'}</span>
                    <span className="status-divider" />
                    <label className="table-switcher">
                        <span className="sr-only">Active table</span>
                        <select
                            value={activeTable.id}
                            onChange={(event) => switchTable(event.target.value)}
                            aria-label="Switch table"
                        >
                            {state.tables.map((table) => (
                                <option key={table.id} value={table.id}>
                                    {table.label}
                                    {table.status === 'paid' ? ' · paid' : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <div className="top-actions">
                    <div className="mode-toggle" role="group" aria-label="Workspace mode">
                        <button
                            type="button"
                            className={view === 'service' ? 'active' : ''}
                            onClick={() => setView('service')}
                        >
                            Service
                        </button>
                        <button
                            type="button"
                            className={view === 'admin' ? 'active' : ''}
                            onClick={() => setView('admin')}
                        >
                            <Icon name="settings" /> Menu
                        </button>
                    </div>
                    <div className="staff">
                        <span className="avatar">AM</span>
                        <span>
                            <strong>Alex Morgan</strong>
                            <small>Server</small>
                        </span>
                    </div>
                </div>
            </header>

            <main className="workspace">
                {view === 'service' ? (
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
                            {FILTERS.map((item) => (
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
                                const quantity =
                                    activeTable.lines.find((line) => line.menuItemId === item.id)?.quantity ??
                                    0;
                                return (
                                    <article className="menu-card" key={item.id}>
                                        <div className="food-image">
                                            <img src={item.image} alt="" />
                                            {item.popular && <span className="popular">Popular</span>}
                                            {quantity > 0 && (
                                                <span className="in-order">{quantity} in order</span>
                                            )}
                                        </div>
                                        <div className="card-copy">
                                            <p className="item-category">{item.category}</p>
                                            <h2>{item.name}</h2>
                                            <p className="description">{item.description}</p>
                                            <div className="card-footer">
                                                <strong>{money(item.priceCents)}</strong>
                                                {isPaid ? (
                                                    <span className="paid-lock">Paid</span>
                                                ) : quantity === 0 ? (
                                                    <button
                                                        className="add-button"
                                                        type="button"
                                                        onClick={() => changeQuantity(item.id, 1)}
                                                    >
                                                        <span>+</span> Add
                                                    </button>
                                                ) : (
                                                    <div
                                                        className="stepper compact"
                                                        aria-label={`${item.name} quantity`}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => changeQuantity(item.id, -1)}
                                                            aria-label={`Remove one ${item.name}`}
                                                        >
                                                            −
                                                        </button>
                                                        <span>{quantity}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => changeQuantity(item.id, 1)}
                                                            aria-label={`Add one ${item.name}`}
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                        {filteredItems.length === 0 && (
                            <p className="empty-menu">No dishes match your search.</p>
                        )}
                    </section>
                ) : (
                    <section className="menu-panel admin-panel">
                        <div className="menu-heading">
                            <div>
                                <p className="eyebrow">Menu editor</p>
                                <h1>Manage dishes</h1>
                            </div>
                        </div>

                        <div className="admin-grid">
                            <form
                                className="admin-form"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    saveMenuItem();
                                }}
                            >
                                <h2>{editingId ? 'Edit item' : 'Add item'}</h2>
                                <label>
                                    Name
                                    <input
                                        value={menuForm.name}
                                        onChange={(event) =>
                                            setMenuForm((current) => ({
                                                ...current,
                                                name: event.target.value,
                                            }))
                                        }
                                        required
                                    />
                                </label>
                                <label>
                                    Description
                                    <textarea
                                        value={menuForm.description}
                                        onChange={(event) =>
                                            setMenuForm((current) => ({
                                                ...current,
                                                description: event.target.value,
                                            }))
                                        }
                                        rows={3}
                                    />
                                </label>
                                <div className="admin-row">
                                    <label>
                                        Category
                                        <select
                                            value={menuForm.category}
                                            onChange={(event) =>
                                                setMenuForm((current) => ({
                                                    ...current,
                                                    category: event.target.value as MenuCategory,
                                                }))
                                            }
                                        >
                                            {MENU_CATEGORIES.map((entry) => (
                                                <option key={entry} value={entry}>
                                                    {entry}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label>
                                        Price (USD)
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={(menuForm.priceCents / 100).toFixed(2)}
                                            onChange={(event) =>
                                                setMenuForm((current) => ({
                                                    ...current,
                                                    priceCents: Math.round(
                                                        Number(event.target.value || 0) * 100,
                                                    ),
                                                }))
                                            }
                                            required
                                        />
                                    </label>
                                </div>
                                <label>
                                    Image URL
                                    <input
                                        value={menuForm.image}
                                        onChange={(event) =>
                                            setMenuForm((current) => ({
                                                ...current,
                                                image: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                                <label className="checkbox">
                                    <input
                                        type="checkbox"
                                        checked={Boolean(menuForm.popular)}
                                        onChange={(event) =>
                                            setMenuForm((current) => ({
                                                ...current,
                                                popular: event.target.checked,
                                            }))
                                        }
                                    />
                                    Mark as popular
                                </label>
                                <div className="admin-actions">
                                    <button className="generate-button" type="submit">
                                        {editingId ? 'Save changes' : 'Add to menu'}
                                    </button>
                                    {editingId && (
                                        <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() => {
                                                setEditingId(null);
                                                setMenuForm(emptyMenuForm());
                                            }}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </form>

                            <div className="admin-list">
                                <div className="table-manager">
                                    <h2>Tables</h2>
                                    <div className="admin-row">
                                        <input
                                            value={newTableLabel}
                                            onChange={(event) => setNewTableLabel(event.target.value)}
                                            placeholder="New table label"
                                            aria-label="New table label"
                                        />
                                        <button type="button" className="secondary-button" onClick={addTable}>
                                            <Icon name="plus" /> Add table
                                        </button>
                                    </div>
                                    <ul className="table-list">
                                        {state.tables.map((table) => (
                                            <li key={table.id}>
                                                <button
                                                    type="button"
                                                    className={
                                                        table.id === activeTable.id ? 'active' : ''
                                                    }
                                                    onClick={() => switchTable(table.id)}
                                                >
                                                    <strong>{table.label}</strong>
                                                    <span>{table.status}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <h2>Current menu</h2>
                                {state.menu.map((item) => (
                                    <div className="admin-item" key={item.id}>
                                        <img src={item.image} alt="" />
                                        <div>
                                            <strong>{item.name}</strong>
                                            <p>
                                                {item.category} · {money(item.priceCents)}
                                            </p>
                                        </div>
                                        <div className="admin-item-actions">
                                            <button type="button" onClick={() => editMenuItem(item)}>
                                                Edit
                                            </button>
                                            <button type="button" onClick={() => deleteMenuItem(item.id)}>
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                )}

                <aside className="order-panel">
                    <div className="order-title">
                        <div>
                            <p className="eyebrow">Current order</p>
                            <h2>{activeTable.label}</h2>
                        </div>
                        <button
                            className="clear-button"
                            type="button"
                            onClick={clearOrder}
                            disabled={!itemCount || isPaid}
                            aria-label="Clear order"
                        >
                            <Icon name="trash" />
                        </button>
                    </div>
                    <div className="order-meta">
                        <span>
                            <Icon name="clock" /> {isPaid ? 'Paid' : 'Dine in'}
                        </span>
                        <span>
                            {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </span>
                    </div>

                    <div className="guest-bar">
                        <div className="guest-bar-title">
                            <Icon name="users" />
                            <span>Split check</span>
                        </div>
                        <div className="guest-chips">
                            {activeTable.guests.map((guest) => (
                                <div className="guest-chip" key={guest.id}>
                                    <input
                                        value={guest.name}
                                        onChange={(event) => renameGuest(guest.id, event.target.value)}
                                        aria-label="Guest name"
                                        disabled={isPaid}
                                    />
                                    {activeTable.guests.length > 1 && !isPaid && (
                                        <button
                                            type="button"
                                            onClick={() => removeGuest(guest.id)}
                                            aria-label={`Remove ${guest.name}`}
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            ))}
                            {!isPaid && (
                                <button type="button" className="add-guest" onClick={addGuest}>
                                    <Icon name="plus" /> Guest
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="order-list">
                        {activeTable.lines.length ? (
                            activeTable.lines.map((line) => {
                                const item = menuById.get(line.menuItemId);
                                if (!item) return null;
                                return (
                                    <div className="order-item" key={line.menuItemId}>
                                        <div className="order-item-top">
                                            <div>
                                                <h3>{item.name}</h3>
                                                <p>{money(item.priceCents)} each</p>
                                            </div>
                                            <strong>{money(item.priceCents * line.quantity)}</strong>
                                        </div>
                                        <div className="order-item-controls">
                                            <div
                                                className="stepper"
                                                aria-label={`${item.name} quantity`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => changeQuantity(item.id, -1)}
                                                    disabled={isPaid}
                                                    aria-label={`Remove one ${item.name}`}
                                                >
                                                    −
                                                </button>
                                                <span>{line.quantity}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => changeQuantity(item.id, 1)}
                                                    disabled={isPaid}
                                                    aria-label={`Add one ${item.name}`}
                                                >
                                                    +
                                                </button>
                                            </div>
                                            <label className="guest-assign">
                                                <span className="sr-only">Assign guest</span>
                                                <select
                                                    value={line.guestId ?? ''}
                                                    onChange={(event) =>
                                                        assignGuest(item.id, event.target.value)
                                                    }
                                                    disabled={isPaid}
                                                >
                                                    {activeTable.guests.map((guest) => (
                                                        <option key={guest.id} value={guest.id}>
                                                            {guest.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="empty-order">
                                <span>
                                    <Icon name="receipt" />
                                </span>
                                <h3>{isPaid ? 'Ready for the next party' : 'Your order is empty'}</h3>
                                <p>
                                    {isPaid
                                        ? 'Reopen this table to start a new bill.'
                                        : 'Add a dish from the menu to begin.'}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="billing-controls">
                        <div className="tip-presets" role="group" aria-label="Tip presets">
                            {TIP_PRESETS.map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    className={activeTable.tipPreset === preset ? 'active' : ''}
                                    onClick={() => setTipPreset(preset)}
                                    disabled={isPaid}
                                >
                                    {preset}%
                                </button>
                            ))}
                            <button
                                type="button"
                                className={activeTable.tipPreset === 'custom' ? 'active' : ''}
                                onClick={() => setTipPreset('custom')}
                                disabled={isPaid}
                            >
                                Custom
                            </button>
                        </div>
                        {activeTable.tipPreset === 'custom' && (
                            <label className="custom-tip">
                                Custom tip %
                                <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={activeTable.tipCustomPercent}
                                    disabled={isPaid}
                                    onChange={(event) =>
                                        updateActiveTable((table) => ({
                                            ...table,
                                            tipCustomPercent: Number(event.target.value || 0),
                                            billGeneratedAt: null,
                                        }))
                                    }
                                />
                            </label>
                        )}
                        <label className="tax-toggle">
                            <input
                                type="checkbox"
                                checked={activeTable.taxEnabled}
                                disabled={isPaid}
                                onChange={(event) =>
                                    updateActiveTable((table) => ({
                                        ...table,
                                        taxEnabled: event.target.checked,
                                        billGeneratedAt: null,
                                    }))
                                }
                            />
                            Apply tax
                            <input
                                className="tax-input"
                                type="number"
                                min="0"
                                step="0.1"
                                value={activeTable.taxPercent}
                                disabled={isPaid || !activeTable.taxEnabled}
                                onChange={(event) =>
                                    updateActiveTable((table) => ({
                                        ...table,
                                        taxPercent: Number(event.target.value || 0),
                                        billGeneratedAt: null,
                                    }))
                                }
                                aria-label="Tax percent"
                            />
                            %
                        </label>
                    </div>

                    <div className="bill-summary">
                        <div>
                            <span>Subtotal</span>
                            <strong>{money(bill.subtotalCents)}</strong>
                        </div>
                        <div>
                            <span>
                                Tax
                                {activeTable.taxEnabled ? ` (${activeTable.taxPercent}%)` : ''}
                            </span>
                            <strong>
                                {activeTable.taxEnabled ? money(bill.taxCents) : '—'}
                            </strong>
                        </div>
                        <div>
                            <span>Tip ({tipLabel(activeTable.tipPreset, activeTable.tipCustomPercent)})</span>
                            <strong>{money(bill.tipCents)}</strong>
                        </div>
                        <div className="total">
                            <span>Total</span>
                            <strong>{money(bill.totalCents)}</strong>
                        </div>
                        {bill.guestBreakdown.filter((guest) => guest.subtotalCents > 0).length > 1 && (
                            <div className="guest-totals">
                                {bill.guestBreakdown
                                    .filter((guest) => guest.subtotalCents > 0)
                                    .map((guest) => (
                                        <div key={guest.name}>
                                            <span>{guest.name}</span>
                                            <strong>{money(guest.totalCents)}</strong>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>

                    {!isPaid ? (
                        <>
                            <button
                                className={`generate-button ${activeTable.billGeneratedAt ? 'ready' : ''}`}
                                type="button"
                                disabled={!itemCount}
                                onClick={generateBill}
                            >
                                <Icon name={activeTable.billGeneratedAt ? 'check' : 'receipt'} />
                                {activeTable.billGeneratedAt ? 'View receipt' : 'Generate bill'}
                                {!activeTable.billGeneratedAt && <span>{money(bill.totalCents)}</span>}
                            </button>
                            <div className="secondary-actions">
                                <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={!itemCount}
                                    onClick={shareFromToolbar}
                                >
                                    <Icon name="share" /> Share
                                </button>
                                <button
                                    type="button"
                                    className="secondary-button paid-button"
                                    disabled={!itemCount}
                                    onClick={markPaid}
                                >
                                    <Icon name="check" /> Mark paid
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <button className="generate-button ready" type="button" onClick={() => setReceipt(buildSnapshot(activeTable, state.menu))}>
                                <Icon name="receipt" /> View paid receipt
                            </button>
                            <button type="button" className="secondary-button" onClick={reopenTable}>
                                Reopen table
                            </button>
                        </>
                    )}
                    {shareFeedback && (
                        <div className="bill-message" role="status">
                            <strong>{shareFeedback}</strong>
                        </div>
                    )}
                </aside>
            </main>

            {receipt && (
                <ReceiptView
                    snapshot={receipt}
                    shareFeedback={shareFeedback}
                    onShareFeedback={setShareFeedback}
                    onClose={() => {
                        setReceipt(null);
                        setShareFeedback(null);
                        if (window.location.hash.startsWith('#bill=')) {
                            history.replaceState(null, '', window.location.pathname);
                        }
                    }}
                />
            )}
        </div>
    );
}
