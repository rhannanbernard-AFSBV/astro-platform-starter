import { useEffect, useMemo, useState, type ReactNode } from 'react';
import './restaurant-bill-generator.css';
import {
    createId,
    createTable,
    DEFAULT_TAX_PERCENT,
    PLACEHOLDER_IMAGE,
    STAFF_USERS,
} from './bill/defaults';
import {
    buildSnapshot,
    computeBill,
    computePayment,
    decodeSnapshot,
    encodeSnapshot,
    lineTotalCents,
    money,
    salesForDay,
    salesToCsv,
    summarizeSales,
    tipLabel,
    unitPriceCents,
} from './bill/math';
import { findStaffByPin, loadState, saveState } from './bill/storage';
import {
    MENU_CATEGORIES,
    TIP_PRESETS,
    type BillSnapshot,
    type FilterCategory,
    type KitchenStatus,
    type MenuCategory,
    type MenuItem,
    type PaymentMethod,
    type PersistedState,
    type SelectedModifier,
    type TableOrder,
    type TipPreset,
} from './bill/types';

const FILTERS: FilterCategory[] = ['All', ...MENU_CATEGORIES];
type ViewMode = 'service' | 'kitchen' | 'reports' | 'admin';

function Icon({
    name,
}: {
    name:
        | 'search'
        | 'receipt'
        | 'trash'
        | 'check'
        | 'clock'
        | 'print'
        | 'share'
        | 'download'
        | 'users'
        | 'settings'
        | 'plus'
        | 'close'
        | 'chef'
        | 'chart'
        | 'lock'
        | 'wifi';
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
        trash: <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />,
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
        download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
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
                <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
            </>
        ),
        plus: <path d="M12 5v14M5 12h14" />,
        close: <path d="M18 6 6 18M6 6l12 12" />,
        chef: (
            <>
                <path d="M4 14h16v6H4zM8 14V9a4 4 0 0 1 8 0v5" />
                <path d="M9 9c0-2 1.5-3 3-3s3 1 3 3" />
            </>
        ),
        chart: (
            <>
                <path d="M4 19h16" />
                <path d="M7 16V9M12 16V5M17 16v-6" />
            </>
        ),
        lock: (
            <>
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </>
        ),
        wifi: (
            <>
                <path d="M5 12.5a9 9 0 0 1 14 0" />
                <path d="M8.5 16a5 5 0 0 1 7 0" />
                <circle cx="12" cy="20" r="1" />
            </>
        ),
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
        modifierGroups: [],
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
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(snapshot.restaurant.feedbackUrl)}`;

    const printReceipt = () => window.print();

    const downloadReceipt = () => {
        const lines = [
            snapshot.restaurant.name,
            snapshot.restaurant.address,
            snapshot.restaurant.phone,
            `Tax ID: ${snapshot.restaurant.taxId}`,
            snapshot.tableLabel,
            `Server: ${snapshot.serverName}`,
            `Generated: ${new Date(snapshot.generatedAt).toLocaleString()}`,
            `Status: ${snapshot.status}`,
            '',
            ...snapshot.items.map((item) => {
                const mods = item.modifiers.length ? ` [${item.modifiers.join(', ')}]` : '';
                const note = item.note ? ` — ${item.note}` : '';
                return `${item.quantity}x ${item.name}${mods}${note}${item.guestName ? ` (${item.guestName})` : ''}  ${money(item.lineTotalCents)}`;
            }),
            '',
            `Subtotal: ${money(snapshot.subtotalCents)}`,
            snapshot.taxEnabled ? `Tax (${snapshot.taxPercent}%): ${money(snapshot.taxCents)}` : 'Tax: —',
            `Tip (${snapshot.tipPercent}%): ${money(snapshot.tipCents)}`,
            `Total: ${money(snapshot.totalCents)}`,
        ];
        if (snapshot.payment) {
            lines.push(
                '',
                `Paid via ${snapshot.payment.method}`,
                `Cash: ${money(snapshot.payment.cashCents)}`,
                `Card: ${money(snapshot.payment.cardCents)}`,
                `Change: ${money(snapshot.payment.changeDueCents)}`,
            );
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${snapshot.tableLabel.replace(/\s+/g, '-').toLowerCase()}-receipt.txt`;
        anchor.click();
        URL.revokeObjectURL(url);
        onShareFeedback('Receipt downloaded. Use Print / PDF for a PDF copy.');
    };

    const shareReceipt = async () => {
        const url = `${window.location.origin}${window.location.pathname}#bill=${encodeSnapshot(snapshot)}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: `${snapshot.restaurant.name} — ${snapshot.tableLabel}`,
                    text: `Bill total ${money(snapshot.totalCents)}`,
                    url,
                });
                onShareFeedback('Share sheet opened.');
            } else {
                await navigator.clipboard.writeText(url);
                onShareFeedback('Shareable bill link copied.');
            }
        } catch {
            try {
                await navigator.clipboard.writeText(url);
                onShareFeedback('Shareable bill link copied.');
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
                    <header className="receipt-brand">
                        <div className="receipt-logo">S</div>
                        <strong>{snapshot.restaurant.name}</strong>
                        <span>{snapshot.restaurant.tagline}</span>
                        <span>{snapshot.restaurant.address}</span>
                        <span>
                            {snapshot.restaurant.phone} · Tax ID {snapshot.restaurant.taxId}
                        </span>
                        <span>
                            {snapshot.tableLabel} · Server {snapshot.serverName}
                        </span>
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
                                    {item.modifiers.length > 0 && (
                                        <small>{item.modifiers.join(' · ')}</small>
                                    )}
                                    {item.note && <small>Note: {item.note}</small>}
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
                    {snapshot.payment && (
                        <div className="split-block">
                            <p>Payment</p>
                            <div>
                                <span>Method</span>
                                <strong>{snapshot.payment.method}</strong>
                            </div>
                            <div>
                                <span>Cash tendered</span>
                                <strong>{money(snapshot.payment.cashCents)}</strong>
                            </div>
                            <div>
                                <span>Card</span>
                                <strong>{money(snapshot.payment.cardCents)}</strong>
                            </div>
                            <div>
                                <span>Change due</span>
                                <strong>{money(snapshot.payment.changeDueCents)}</strong>
                            </div>
                        </div>
                    )}
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
                    <div className="receipt-qr">
                        <img src={qrUrl} alt="Feedback QR code" width={140} height={140} />
                        <div>
                            <strong>Scan for feedback</strong>
                            <span>{snapshot.restaurant.feedbackUrl}</span>
                        </div>
                    </div>
                    <footer>Thank you for dining with us.</footer>
                </div>
            </div>
        </div>
    );
}

export default function RestaurantBillGenerator() {
    const [hydrated, setHydrated] = useState(false);
    const [online, setOnline] = useState(true);
    const [state, setState] = useState<PersistedState>(() => loadState());
    const [view, setView] = useState<ViewMode>('service');
    const [category, setCategory] = useState<FilterCategory>('All');
    const [search, setSearch] = useState('');
    const [receipt, setReceipt] = useState<BillSnapshot | null>(null);
    const [shareFeedback, setShareFeedback] = useState<string | null>(null);
    const [menuForm, setMenuForm] = useState(emptyMenuForm());
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newTableLabel, setNewTableLabel] = useState('');
    const [pinInput, setPinInput] = useState('');
    const [pinError, setPinError] = useState<string | null>(null);
    const [showPinGate, setShowPinGate] = useState(false);
    const [pendingManagerAction, setPendingManagerAction] = useState<null | (() => void)>(null);
    const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
    const [selectedMods, setSelectedMods] = useState<Record<string, string[]>>({});
    const [lineNote, setLineNote] = useState('');
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [payMethod, setPayMethod] = useState<PaymentMethod>('card');
    const [cashInput, setCashInput] = useState('');
    const [cardInput, setCardInput] = useState('');

    useEffect(() => {
        const initial = loadState();
        setState(initial);
        setHydrated(true);
        setOnline(navigator.onLine);
        const onOnline = () => setOnline(true);
        const onOffline = () => setOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        const hash = window.location.hash;
        if (hash.startsWith('#bill=')) {
            const snapshot = decodeSnapshot(hash.slice(6));
            if (snapshot) setReceipt(snapshot);
        }
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
        };
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        saveState(state);
    }, [state, hydrated]);

    const staff = STAFF_USERS.find((entry) => entry.id === state.activeStaffId) ?? STAFF_USERS[0];
    const isManager = staff.role === 'manager';
    const activeTable =
        state.tables.find((table) => table.id === state.activeTableId) ?? state.tables[0];
    const menuById = useMemo(() => new Map(state.menu.map((item) => [item.id, item])), [state.menu]);
    const bill = useMemo(() => computeBill(activeTable, state.menu), [activeTable, state.menu]);
    const todaySales = useMemo(() => salesForDay(state.sales), [state.sales]);
    const salesSummary = useMemo(() => summarizeSales(todaySales), [todaySales]);

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
    const draftCount = activeTable.lines.filter((line) => line.kitchenStatus === 'draft').length;

    const kitchenTickets = useMemo(() => {
        return state.tables.flatMap((table) =>
            table.lines
                .filter((line) => line.kitchenStatus !== 'draft' && line.kitchenStatus !== 'served')
                .map((line) => ({ table, line, item: menuById.get(line.menuItemId) }))
                .filter((entry) => entry.item),
        );
    }, [state.tables, menuById]);

    const updateActiveTable = (updater: (table: TableOrder) => TableOrder) => {
        setState((current) => ({
            ...current,
            tables: current.tables.map((table) =>
                table.id === current.activeTableId ? updater(table) : table,
            ),
        }));
    };

    const requireManager = (action: () => void) => {
        if (isManager) {
            action();
            return;
        }
        setPendingManagerAction(() => action);
        setPinInput('');
        setPinError(null);
        setShowPinGate(true);
    };

    const submitPin = () => {
        const match = findStaffByPin(pinInput.trim());
        if (!match) {
            setPinError('Invalid PIN. Try 1234 (server) or 9999 (manager).');
            return;
        }
        setState((current) => ({ ...current, activeStaffId: match.id }));
        setShowPinGate(false);
        if (match.role === 'manager' && pendingManagerAction) {
            pendingManagerAction();
        } else if (pendingManagerAction && match.role !== 'manager') {
            setShareFeedback('Manager PIN required for that action.');
        }
        setPendingManagerAction(null);
        setPinInput('');
        setPinError(null);
    };

    const openModifierModal = (item: MenuItem) => {
        if (isPaid) return;
        const defaults: Record<string, string[]> = {};
        item.modifierGroups.forEach((group) => {
            defaults[group.id] = group.multi ? [] : group.options[0] ? [group.options[0].id] : [];
        });
        setSelectedMods(defaults);
        setLineNote('');
        setModifierItem(item);
    };

    const toggleMod = (groupId: string, optionId: string, multi: boolean) => {
        setSelectedMods((current) => {
            const existing = current[groupId] ?? [];
            if (multi) {
                return {
                    ...current,
                    [groupId]: existing.includes(optionId)
                        ? existing.filter((id) => id !== optionId)
                        : [...existing, optionId],
                };
            }
            return { ...current, [groupId]: [optionId] };
        });
    };

    const confirmAddItem = () => {
        if (!modifierItem) return;
        const modifiers: SelectedModifier[] = modifierItem.modifierGroups.flatMap((group) => {
            const selected = selectedMods[group.id] ?? [];
            return selected
                .map((optionId) => group.options.find((option) => option.id === optionId))
                .filter((option): option is NonNullable<typeof option> => Boolean(option))
                .map((option) => ({
                    groupId: group.id,
                    optionId: option.id,
                    name: option.name,
                    priceDeltaCents: option.priceDeltaCents,
                }));
        });
        updateActiveTable((table) => ({
            ...table,
            billGeneratedAt: null,
            lines: [
                ...table.lines,
                {
                    id: createId('line'),
                    menuItemId: modifierItem.id,
                    quantity: 1,
                    guestId: table.guests[0]?.id ?? null,
                    note: lineNote.trim(),
                    modifiers,
                    kitchenStatus: 'draft',
                    sentToKitchenAt: null,
                },
            ],
        }));
        setModifierItem(null);
    };

    const changeQuantity = (lineId: string, change: number) => {
        if (isPaid) return;
        const line = activeTable.lines.find((entry) => entry.id === lineId);
        if (line && line.kitchenStatus !== 'draft' && change < 0) {
            requireManager(() => {
                updateActiveTable((table) => ({
                    ...table,
                    billGeneratedAt: null,
                    lines: table.lines
                        .map((entry) =>
                            entry.id === lineId
                                ? { ...entry, quantity: entry.quantity + change }
                                : entry,
                        )
                        .filter((entry) => entry.quantity > 0),
                }));
            });
            return;
        }
        updateActiveTable((table) => ({
            ...table,
            billGeneratedAt: null,
            lines: table.lines
                .map((entry) =>
                    entry.id === lineId ? { ...entry, quantity: entry.quantity + change } : entry,
                )
                .filter((entry) => entry.quantity > 0),
        }));
    };

    const assignGuest = (lineId: string, guestId: string) => {
        if (isPaid) return;
        updateActiveTable((table) => ({
            ...table,
            billGeneratedAt: null,
            lines: table.lines.map((line) => (line.id === lineId ? { ...line, guestId } : line)),
        }));
    };

    const clearOrder = () => {
        if (isPaid) return;
        requireManager(() =>
            updateActiveTable((table) => ({
                ...table,
                lines: [],
                billGeneratedAt: null,
            })),
        );
    };

    const sendToKitchen = () => {
        if (!draftCount || isPaid) return;
        const sentAt = new Date().toISOString();
        updateActiveTable((table) => ({
            ...table,
            lines: table.lines.map((line) =>
                line.kitchenStatus === 'draft'
                    ? { ...line, kitchenStatus: 'queued', sentToKitchenAt: sentAt }
                    : line,
            ),
        }));
        setShareFeedback(`${draftCount} item(s) sent to kitchen.`);
    };

    const setKitchenStatus = (tableId: string, lineId: string, kitchenStatus: KitchenStatus) => {
        setState((current) => ({
            ...current,
            tables: current.tables.map((table) =>
                table.id !== tableId
                    ? table
                    : {
                          ...table,
                          lines: table.lines.map((line) =>
                              line.id === lineId ? { ...line, kitchenStatus } : line,
                          ),
                      },
            ),
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
        setReceipt(
            buildSnapshot(
                { ...activeTable, billGeneratedAt: generatedAt },
                state.menu,
                state.restaurant,
                staff.name,
            ),
        );
        setShareFeedback(null);
    };

    const openPayment = () => {
        if (!itemCount || isPaid) return;
        setPayMethod('card');
        setCashInput((bill.totalCents / 100).toFixed(2));
        setCardInput((bill.totalCents / 100).toFixed(2));
        setPaymentOpen(true);
    };

    const completePayment = () => {
        const cashCents = Math.round(Number(cashInput || 0) * 100);
        const cardCents = Math.round(Number(cardInput || 0) * 100);
        const payment = computePayment(bill.totalCents, payMethod, cashCents, cardCents);
        if (payMethod === 'cash' && cashCents < bill.totalCents) {
            setShareFeedback('Cash tendered is less than the total.');
            return;
        }
        if (payMethod === 'mixed' && cardCents + Math.max(cashCents, 0) < bill.totalCents) {
            setShareFeedback('Mixed tender does not cover the total.');
            return;
        }
        const paidAt = payment.paidAt;
        const saleId = createId('sale');
        setState((current) => {
            const tables = current.tables.map((table) =>
                table.id === current.activeTableId
                    ? {
                          ...table,
                          status: 'paid' as const,
                          paidAt,
                          payment,
                          billGeneratedAt: table.billGeneratedAt ?? paidAt,
                          lines: table.lines.map((line) =>
                              line.kitchenStatus === 'draft'
                                  ? line
                                  : { ...line, kitchenStatus: 'served' as const },
                          ),
                      }
                    : table,
            );
            return {
                ...current,
                tables,
                sales: [
                    {
                        id: saleId,
                        tableId: activeTable.id,
                        tableLabel: activeTable.label,
                        paidAt,
                        subtotalCents: bill.subtotalCents,
                        taxCents: bill.taxCents,
                        tipCents: bill.tipCents,
                        totalCents: bill.totalCents,
                        payment,
                        serverName: staff.name,
                        itemCount,
                    },
                    ...current.sales,
                ],
            };
        });
        setPaymentOpen(false);
        setShareFeedback(
            `Paid with ${payment.method}. Change due: ${money(payment.changeDueCents)}.`,
        );
    };

    const reopenTable = () => {
        requireManager(() =>
            updateActiveTable((table) => ({
                ...table,
                status: 'open',
                paidAt: null,
                payment: null,
                billGeneratedAt: null,
                lines: [],
            })),
        );
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
            modifierGroups: item.modifierGroups,
        });
        setView('admin');
    };

    const deleteMenuItem = (id: string) => {
        requireManager(() => {
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
        });
    };

    const exportSales = () => {
        const csv = salesToCsv(todaySales);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `savory-sales-${new Date().toISOString().slice(0, 10)}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    };

    const previewPayment = computePayment(
        bill.totalCents,
        payMethod,
        Math.round(Number(cashInput || 0) * 100),
        Math.round(Number(cardInput || 0) * 100),
    );

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
                    <span className="status-divider" />
                    <span className={`online-pill ${online ? 'on' : 'off'}`}>
                        <Icon name="wifi" /> {online ? 'Online' : 'Offline'}
                    </span>
                </div>
                <div className="top-actions">
                    <div className="mode-toggle" role="group" aria-label="Workspace mode">
                        {(
                            [
                                ['service', 'Service'],
                                ['kitchen', 'Kitchen'],
                                ['reports', 'Sales'],
                                ['admin', 'Menu'],
                            ] as const
                        ).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                className={view === key ? 'active' : ''}
                                onClick={() => setView(key)}
                            >
                                {key === 'kitchen' && <Icon name="chef" />}
                                {key === 'reports' && <Icon name="chart" />}
                                {key === 'admin' && <Icon name="settings" />}
                                {label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="staff-chip"
                        onClick={() => {
                            setPendingManagerAction(null);
                            setShowPinGate(true);
                            setPinInput('');
                            setPinError(null);
                        }}
                    >
                        <span className="avatar">{staff.initials}</span>
                        <span>
                            <strong>{staff.name}</strong>
                            <small>
                                {staff.role} · PIN
                            </small>
                        </span>
                    </button>
                </div>
            </header>

            <main className={`workspace ${view !== 'service' ? 'wide-main' : ''}`}>
                {view === 'service' && (
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
                                const quantity = activeTable.lines
                                    .filter((line) => line.menuItemId === item.id)
                                    .reduce((sum, line) => sum + line.quantity, 0);
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
                                                ) : (
                                                    <button
                                                        className="add-button"
                                                        type="button"
                                                        onClick={() => openModifierModal(item)}
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
                        {filteredItems.length === 0 && (
                            <p className="empty-menu">No dishes match your search.</p>
                        )}
                    </section>
                )}

                {view === 'kitchen' && (
                    <section className="menu-panel kitchen-panel">
                        <div className="menu-heading">
                            <div>
                                <p className="eyebrow">Expo</p>
                                <h1>Kitchen tickets</h1>
                            </div>
                        </div>
                        <div className="ticket-grid">
                            {kitchenTickets.length === 0 && (
                                <div className="empty-order">
                                    <span>
                                        <Icon name="chef" />
                                    </span>
                                    <h3>No active tickets</h3>
                                    <p>Send draft items from Service to start the board.</p>
                                </div>
                            )}
                            {kitchenTickets.map(({ table, line, item }) => (
                                <article className={`ticket-card ${line.kitchenStatus}`} key={line.id}>
                                    <header>
                                        <strong>{table.label}</strong>
                                        <span>{line.kitchenStatus}</span>
                                    </header>
                                    <h3>
                                        {line.quantity}× {item!.name}
                                    </h3>
                                    {line.modifiers.length > 0 && (
                                        <p>{line.modifiers.map((mod) => mod.name).join(' · ')}</p>
                                    )}
                                    {line.note && <p className="ticket-note">Note: {line.note}</p>}
                                    <div className="ticket-actions">
                                        {line.kitchenStatus === 'queued' && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setKitchenStatus(table.id, line.id, 'preparing')
                                                }
                                            >
                                                Start
                                            </button>
                                        )}
                                        {(line.kitchenStatus === 'queued' ||
                                            line.kitchenStatus === 'preparing') && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setKitchenStatus(table.id, line.id, 'ready')
                                                }
                                            >
                                                Ready
                                            </button>
                                        )}
                                        {line.kitchenStatus === 'ready' && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setKitchenStatus(table.id, line.id, 'served')
                                                }
                                            >
                                                Served
                                            </button>
                                        )}
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>
                )}

                {view === 'reports' && (
                    <section className="menu-panel reports-panel">
                        <div className="menu-heading">
                            <div>
                                <p className="eyebrow">End of day</p>
                                <h1>Daily sales</h1>
                            </div>
                            <button type="button" className="secondary-button" onClick={exportSales}>
                                <Icon name="download" /> Export CSV
                            </button>
                        </div>
                        <div className="report-stats">
                            <div>
                                <span>Checks</span>
                                <strong>{salesSummary.count}</strong>
                            </div>
                            <div>
                                <span>Items</span>
                                <strong>{salesSummary.itemCount}</strong>
                            </div>
                            <div>
                                <span>Tax</span>
                                <strong>{money(salesSummary.taxCents)}</strong>
                            </div>
                            <div>
                                <span>Tips</span>
                                <strong>{money(salesSummary.tipCents)}</strong>
                            </div>
                            <div>
                                <span>Cash net</span>
                                <strong>{money(salesSummary.cashCents)}</strong>
                            </div>
                            <div>
                                <span>Card</span>
                                <strong>{money(salesSummary.cardCents)}</strong>
                            </div>
                            <div className="wide">
                                <span>Total sales</span>
                                <strong>{money(salesSummary.totalCents)}</strong>
                            </div>
                        </div>
                        <div className="sales-table">
                            <div className="sales-row head">
                                <span>Time</span>
                                <span>Table</span>
                                <span>Server</span>
                                <span>Method</span>
                                <span>Total</span>
                            </div>
                            {todaySales.length === 0 && (
                                <p className="empty-menu">No paid checks yet today.</p>
                            )}
                            {todaySales.map((sale) => (
                                <div className="sales-row" key={sale.id}>
                                    <span>{new Date(sale.paidAt).toLocaleTimeString()}</span>
                                    <span>{sale.tableLabel}</span>
                                    <span>{sale.serverName}</span>
                                    <span>{sale.payment.method}</span>
                                    <span>{money(sale.totalCents)}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {view === 'admin' && (
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
                                                    className={table.id === activeTable.id ? 'active' : ''}
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
                                                {item.category} · {money(item.priceCents)} ·{' '}
                                                {item.modifierGroups.length} modifier groups
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

                {view === 'service' && (
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
                                            onChange={(event) =>
                                                renameGuest(guest.id, event.target.value)
                                            }
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
                                        <div className="order-item" key={line.id}>
                                            <div className="order-item-top">
                                                <div>
                                                    <h3>{item.name}</h3>
                                                    <p>
                                                        {money(unitPriceCents(item, line))} each ·{' '}
                                                        {line.kitchenStatus}
                                                    </p>
                                                    {line.modifiers.length > 0 && (
                                                        <p className="mod-line">
                                                            {line.modifiers
                                                                .map((mod) => mod.name)
                                                                .join(' · ')}
                                                        </p>
                                                    )}
                                                    {line.note && (
                                                        <p className="mod-line">Note: {line.note}</p>
                                                    )}
                                                </div>
                                                <strong>{money(lineTotalCents(item, line))}</strong>
                                            </div>
                                            <div className="order-item-controls">
                                                <div
                                                    className="stepper"
                                                    aria-label={`${item.name} quantity`}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => changeQuantity(line.id, -1)}
                                                        disabled={isPaid}
                                                        aria-label={`Remove one ${item.name}`}
                                                    >
                                                        −
                                                    </button>
                                                    <span>{line.quantity}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => changeQuantity(line.id, 1)}
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
                                                            assignGuest(line.id, event.target.value)
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
                                <span>
                                    Tip ({tipLabel(activeTable.tipPreset, activeTable.tipCustomPercent)})
                                </span>
                                <strong>{money(bill.tipCents)}</strong>
                            </div>
                            <div className="total">
                                <span>Total</span>
                                <strong>{money(bill.totalCents)}</strong>
                            </div>
                        </div>

                        {!isPaid ? (
                            <>
                                <button
                                    className="secondary-button"
                                    type="button"
                                    disabled={!draftCount}
                                    onClick={sendToKitchen}
                                >
                                    <Icon name="chef" /> Send to kitchen
                                    {draftCount > 0 && <span className="count-badge">{draftCount}</span>}
                                </button>
                                <button
                                    className={`generate-button ${activeTable.billGeneratedAt ? 'ready' : ''}`}
                                    type="button"
                                    disabled={!itemCount}
                                    onClick={generateBill}
                                >
                                    <Icon name={activeTable.billGeneratedAt ? 'check' : 'receipt'} />
                                    {activeTable.billGeneratedAt ? 'View receipt' : 'Generate bill'}
                                    {!activeTable.billGeneratedAt && (
                                        <span>{money(bill.totalCents)}</span>
                                    )}
                                </button>
                                <div className="secondary-actions">
                                    <button
                                        type="button"
                                        className="secondary-button paid-button"
                                        disabled={!itemCount}
                                        onClick={openPayment}
                                    >
                                        <Icon name="check" /> Take payment
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <button
                                    className="generate-button ready"
                                    type="button"
                                    onClick={() =>
                                        setReceipt(
                                            buildSnapshot(
                                                activeTable,
                                                state.menu,
                                                state.restaurant,
                                                staff.name,
                                            ),
                                        )
                                    }
                                >
                                    <Icon name="receipt" /> View paid receipt
                                </button>
                                <button type="button" className="secondary-button" onClick={reopenTable}>
                                    <Icon name="lock" /> Reopen table
                                </button>
                            </>
                        )}
                        {shareFeedback && (
                            <div className="bill-message" role="status">
                                <strong>{shareFeedback}</strong>
                            </div>
                        )}
                    </aside>
                )}
            </main>

            {modifierItem && (
                <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Customize item">
                    <div className="receipt-sheet modifier-sheet">
                        <div className="receipt-toolbar">
                            <div>
                                <p className="eyebrow">Customize</p>
                                <h2>{modifierItem.name}</h2>
                            </div>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => setModifierItem(null)}
                                aria-label="Close customize"
                            >
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modifier-body">
                            {modifierItem.modifierGroups.map((group) => (
                                <div key={group.id} className="mod-group">
                                    <h3>
                                        {group.name}
                                        <small>{group.multi ? 'Multi' : 'Pick one'}</small>
                                    </h3>
                                    <div className="mod-options">
                                        {group.options.map((option) => {
                                            const active = (selectedMods[group.id] ?? []).includes(
                                                option.id,
                                            );
                                            return (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    className={active ? 'active' : ''}
                                                    onClick={() =>
                                                        toggleMod(group.id, option.id, group.multi)
                                                    }
                                                >
                                                    <span>{option.name}</span>
                                                    <strong>
                                                        {option.priceDeltaCents === 0
                                                            ? 'Included'
                                                            : `+${money(option.priceDeltaCents)}`}
                                                    </strong>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                            <label className="custom-tip">
                                Special note
                                <input
                                    value={lineNote}
                                    onChange={(event) => setLineNote(event.target.value)}
                                    placeholder="No onions, allergy note…"
                                />
                            </label>
                            <button type="button" className="generate-button" onClick={confirmAddItem}>
                                Add to order
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {paymentOpen && (
                <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Take payment">
                    <div className="receipt-sheet modifier-sheet">
                        <div className="receipt-toolbar">
                            <div>
                                <p className="eyebrow">Payment</p>
                                <h2>{money(bill.totalCents)}</h2>
                            </div>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => setPaymentOpen(false)}
                                aria-label="Close payment"
                            >
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modifier-body">
                            <div className="tip-presets">
                                {(['cash', 'card', 'mixed'] as PaymentMethod[]).map((method) => (
                                    <button
                                        key={method}
                                        type="button"
                                        className={payMethod === method ? 'active' : ''}
                                        onClick={() => setPayMethod(method)}
                                    >
                                        {method}
                                    </button>
                                ))}
                            </div>
                            {(payMethod === 'cash' || payMethod === 'mixed') && (
                                <label className="custom-tip">
                                    Cash tendered
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={cashInput}
                                        onChange={(event) => setCashInput(event.target.value)}
                                    />
                                </label>
                            )}
                            {(payMethod === 'card' || payMethod === 'mixed') && (
                                <label className="custom-tip">
                                    Card amount
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={cardInput}
                                        onChange={(event) => setCardInput(event.target.value)}
                                    />
                                </label>
                            )}
                            <div className="bill-summary">
                                <div>
                                    <span>Change due</span>
                                    <strong>{money(previewPayment.changeDueCents)}</strong>
                                </div>
                            </div>
                            <button type="button" className="generate-button" onClick={completePayment}>
                                Complete payment
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPinGate && (
                <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Staff PIN">
                    <div className="receipt-sheet modifier-sheet">
                        <div className="receipt-toolbar">
                            <div>
                                <p className="eyebrow">Staff access</p>
                                <h2>Enter PIN</h2>
                            </div>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                    setShowPinGate(false);
                                    setPendingManagerAction(null);
                                }}
                                aria-label="Close PIN"
                            >
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modifier-body">
                            <p className="pin-help">Server 1234 · Manager 9999</p>
                            <label className="custom-tip">
                                PIN
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    value={pinInput}
                                    onChange={(event) => setPinInput(event.target.value)}
                                    autoFocus
                                />
                            </label>
                            {pinError && <p className="share-feedback">{pinError}</p>}
                            <button type="button" className="generate-button" onClick={submitPin}>
                                Unlock
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
