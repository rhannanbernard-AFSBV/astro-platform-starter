import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import './restaurant-bill-generator.css';
import {
    createId,
    createTable,
    DEFAULT_TAX_PERCENT,
    PLACEHOLDER_IMAGE,
    STAFF_USERS,
} from './bill/defaults';
import { Icon } from './bill/Icons';
import {
    buildSnapshot,
    computeBill,
    computePayment,
    decodeSnapshot,
    formatDual,
    salesForDay,
    salesToCsv,
    usdCentsToXcgCents,
} from './bill/math';
import ModifierModal from './bill/ModifierModal';
import OrderPanel from './bill/OrderPanel';
import PaymentModal, {
    paymentInputsToUsd,
    type TenderCurrency,
} from './bill/PaymentModal';
import PinGate from './bill/PinGate';
import ReceiptView from './bill/ReceiptView';
import ServiceMenu from './bill/ServiceMenu';
import { findStaffByPin, loadState } from './bill/storage';
import { useDebouncedSave } from './bill/useDebouncedSave';
import {
    type BillSnapshot,
    type FilterCategory,
    type KitchenStatus,
    type MenuItem,
    type PaymentMethod,
    type PersistedState,
    type SelectedModifier,
    type TableOrder,
    type TipPreset,
} from './bill/types';

const KitchenBoard = lazy(() => import('./bill/KitchenBoard'));
const SalesReport = lazy(() => import('./bill/SalesReport'));
const AdminPanel = lazy(() => import('./bill/AdminPanel'));

type ViewMode = 'service' | 'kitchen' | 'reports' | 'admin';

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

function ViewFallback() {
    return <div className="view-fallback">Loading view…</div>;
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
    const [tenderCurrency, setTenderCurrency] = useState<TenderCurrency>('USD');
    const [cashInput, setCashInput] = useState('');
    const [cardInput, setCardInput] = useState('');

    useDebouncedSave(state, hydrated, 400);

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

    const staff = STAFF_USERS.find((entry) => entry.id === state.activeStaffId) ?? STAFF_USERS[0];
    const isManager = staff.role === 'manager';
    const activeTable =
        state.tables.find((table) => table.id === state.activeTableId) ?? state.tables[0];
    const menuById = useMemo(() => new Map(state.menu.map((item) => [item.id, item])), [state.menu]);
    const bill = useMemo(() => computeBill(activeTable, state.menu), [activeTable, state.menu]);
    const todaySales = useMemo(() => salesForDay(state.sales), [state.sales]);
    const itemCount = useMemo(
        () => activeTable.lines.reduce((total, line) => total + line.quantity, 0),
        [activeTable.lines],
    );
    const draftCount = useMemo(
        () => activeTable.lines.filter((line) => line.kitchenStatus === 'draft').length,
        [activeTable.lines],
    );
    const isPaid = activeTable.status === 'paid';

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
        if (match.role === 'manager' && pendingManagerAction) pendingManagerAction();
        else if (pendingManagerAction && match.role !== 'manager') {
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
        const apply = () =>
            updateActiveTable((table) => ({
                ...table,
                billGeneratedAt: null,
                lines: table.lines
                    .map((entry) =>
                        entry.id === lineId ? { ...entry, quantity: entry.quantity + change } : entry,
                    )
                    .filter((entry) => entry.quantity > 0),
            }));
        if (line && line.kitchenStatus !== 'draft' && change < 0) {
            requireManager(apply);
            return;
        }
        apply();
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

    const fillPaymentDefaults = (currency: TenderCurrency) => {
        if (currency === 'XCG') {
            const xcg = (usdCentsToXcgCents(bill.totalCents) / 100).toFixed(2);
            setCashInput(xcg);
            setCardInput(xcg);
        } else {
            const usd = (bill.totalCents / 100).toFixed(2);
            setCashInput(usd);
            setCardInput(usd);
        }
    };

    const openPayment = () => {
        if (!itemCount || isPaid) return;
        setPayMethod('card');
        setTenderCurrency('USD');
        fillPaymentDefaults('USD');
        setPaymentOpen(true);
    };

    const completePayment = () => {
        const { cashCents, cardCents } = paymentInputsToUsd(
            payMethod,
            tenderCurrency,
            cashInput,
            cardInput,
        );
        const payment = computePayment(bill.totalCents, payMethod, cashCents, cardCents);
        if (payMethod === 'cash' && cashCents < bill.totalCents) {
            setShareFeedback(`Cash tendered is less than the total (${formatDual(bill.totalCents)}).`);
            return;
        }
        if (payMethod === 'mixed' && cardCents + Math.max(cashCents, 0) < bill.totalCents) {
            setShareFeedback('Mixed tender does not cover the total.');
            return;
        }
        const paidAt = payment.paidAt;
        setState((current) => ({
            ...current,
            tables: current.tables.map((table) =>
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
            ),
            sales: [
                {
                    id: createId('sale'),
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
        }));
        setPaymentOpen(false);
        setShareFeedback(
            `Paid with ${payment.method} (${tenderCurrency}). Change due: ${formatDual(payment.changeDueCents)}.`,
        );
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
                        <small>Kitchen &amp; Bar · USD/XCG</small>
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
                            onChange={(event) => {
                                setState((current) => ({
                                    ...current,
                                    activeTableId: event.target.value,
                                }));
                                setReceipt(null);
                            }}
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
                    <ServiceMenu
                        menu={state.menu}
                        activeTable={activeTable}
                        category={category}
                        search={search}
                        isPaid={isPaid}
                        onCategory={setCategory}
                        onSearch={setSearch}
                        onAdd={openModifierModal}
                    />
                )}

                {view === 'kitchen' && (
                    <Suspense fallback={<ViewFallback />}>
                        <KitchenBoard
                            tables={state.tables}
                            menuById={menuById}
                            onStatus={setKitchenStatus}
                        />
                    </Suspense>
                )}

                {view === 'reports' && (
                    <Suspense fallback={<ViewFallback />}>
                        <SalesReport sales={todaySales} onExport={exportSales} />
                    </Suspense>
                )}

                {view === 'admin' && (
                    <Suspense fallback={<ViewFallback />}>
                        <AdminPanel
                            menu={state.menu}
                            tables={state.tables}
                            activeTableId={activeTable.id}
                            menuForm={menuForm}
                            editingId={editingId}
                            newTableLabel={newTableLabel}
                            onFormChange={setMenuForm}
                            onSaveItem={() => {
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
                                    setState((current) => ({
                                        ...current,
                                        menu: [
                                            ...current.menu,
                                            {
                                                id: createId('menu'),
                                                ...menuForm,
                                                name: menuForm.name.trim(),
                                                description: menuForm.description.trim(),
                                            },
                                        ],
                                    }));
                                }
                                setMenuForm(emptyMenuForm());
                                setEditingId(null);
                            }}
                            onCancelEdit={() => {
                                setEditingId(null);
                                setMenuForm(emptyMenuForm());
                            }}
                            onEditItem={(item) => {
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
                            }}
                            onDeleteItem={(id) =>
                                requireManager(() => {
                                    setState((current) => ({
                                        ...current,
                                        menu: current.menu.filter((item) => item.id !== id),
                                        tables: current.tables.map((table) => ({
                                            ...table,
                                            lines: table.lines.filter(
                                                (line) => line.menuItemId !== id,
                                            ),
                                        })),
                                    }));
                                    if (editingId === id) {
                                        setEditingId(null);
                                        setMenuForm(emptyMenuForm());
                                    }
                                })
                            }
                            onNewTableLabel={setNewTableLabel}
                            onAddTable={() => {
                                const label =
                                    newTableLabel.trim() || `Table ${state.tables.length + 1}`;
                                const table = createTable(label, DEFAULT_TAX_PERCENT);
                                setState((current) => ({
                                    ...current,
                                    tables: [...current.tables, table],
                                    activeTableId: table.id,
                                }));
                                setNewTableLabel('');
                            }}
                            onSwitchTable={(tableId) => {
                                setState((current) => ({ ...current, activeTableId: tableId }));
                                setReceipt(null);
                            }}
                        />
                    </Suspense>
                )}

                {view === 'service' && (
                    <OrderPanel
                        activeTable={activeTable}
                        menuById={menuById}
                        bill={bill}
                        itemCount={itemCount}
                        draftCount={draftCount}
                        isPaid={isPaid}
                        shareFeedback={shareFeedback}
                        onClear={() =>
                            requireManager(() =>
                                updateActiveTable((table) => ({
                                    ...table,
                                    lines: [],
                                    billGeneratedAt: null,
                                })),
                            )
                        }
                        onAddGuest={() => {
                            if (isPaid) return;
                            updateActiveTable((table) => ({
                                ...table,
                                guests: [
                                    ...table.guests,
                                    {
                                        id: createId('guest'),
                                        name: `Guest ${table.guests.length + 1}`,
                                    },
                                ],
                            }));
                        }}
                        onRenameGuest={(guestId, name) =>
                            updateActiveTable((table) => ({
                                ...table,
                                guests: table.guests.map((guest) =>
                                    guest.id === guestId ? { ...guest, name } : guest,
                                ),
                            }))
                        }
                        onRemoveGuest={(guestId) => {
                            if (isPaid) return;
                            updateActiveTable((table) => {
                                if (table.guests.length <= 1) return table;
                                const fallback =
                                    table.guests.find((guest) => guest.id !== guestId)?.id ?? null;
                                return {
                                    ...table,
                                    guests: table.guests.filter((guest) => guest.id !== guestId),
                                    lines: table.lines.map((line) =>
                                        line.guestId === guestId
                                            ? { ...line, guestId: fallback }
                                            : line,
                                    ),
                                    billGeneratedAt: null,
                                };
                            });
                        }}
                        onChangeQuantity={changeQuantity}
                        onAssignGuest={(lineId, guestId) => {
                            if (isPaid) return;
                            updateActiveTable((table) => ({
                                ...table,
                                billGeneratedAt: null,
                                lines: table.lines.map((line) =>
                                    line.id === lineId ? { ...line, guestId } : line,
                                ),
                            }));
                        }}
                        onTipPreset={(preset: TipPreset) => {
                            if (isPaid) return;
                            updateActiveTable((table) => ({
                                ...table,
                                tipPreset: preset,
                                tipCustomPercent:
                                    preset === 'custom' ? table.tipCustomPercent : preset,
                                billGeneratedAt: null,
                            }));
                        }}
                        onCustomTip={(value) =>
                            updateActiveTable((table) => ({
                                ...table,
                                tipCustomPercent: value,
                                billGeneratedAt: null,
                            }))
                        }
                        onTaxEnabled={(enabled) =>
                            updateActiveTable((table) => ({
                                ...table,
                                taxEnabled: enabled,
                                billGeneratedAt: null,
                            }))
                        }
                        onTaxPercent={(value) =>
                            updateActiveTable((table) => ({
                                ...table,
                                taxPercent: value,
                                billGeneratedAt: null,
                            }))
                        }
                        onSendKitchen={() => {
                            if (!draftCount || isPaid) return;
                            const sentAt = new Date().toISOString();
                            updateActiveTable((table) => ({
                                ...table,
                                lines: table.lines.map((line) =>
                                    line.kitchenStatus === 'draft'
                                        ? {
                                              ...line,
                                              kitchenStatus: 'queued',
                                              sentToKitchenAt: sentAt,
                                          }
                                        : line,
                                ),
                            }));
                            setShareFeedback(`${draftCount} item(s) sent to kitchen.`);
                        }}
                        onGenerateBill={generateBill}
                        onTakePayment={openPayment}
                        onViewPaidReceipt={() =>
                            setReceipt(
                                buildSnapshot(
                                    activeTable,
                                    state.menu,
                                    state.restaurant,
                                    staff.name,
                                ),
                            )
                        }
                        onReopen={() =>
                            requireManager(() =>
                                updateActiveTable((table) => ({
                                    ...table,
                                    status: 'open',
                                    paidAt: null,
                                    payment: null,
                                    billGeneratedAt: null,
                                    lines: [],
                                })),
                            )
                        }
                    />
                )}
            </main>

            {modifierItem && (
                <ModifierModal
                    item={modifierItem}
                    selectedMods={selectedMods}
                    lineNote={lineNote}
                    onToggleMod={toggleMod}
                    onNote={setLineNote}
                    onConfirm={confirmAddItem}
                    onClose={() => setModifierItem(null)}
                />
            )}

            {paymentOpen && (
                <PaymentModal
                    totalCents={bill.totalCents}
                    payMethod={payMethod}
                    tenderCurrency={tenderCurrency}
                    cashInput={cashInput}
                    cardInput={cardInput}
                    onMethod={setPayMethod}
                    onCurrency={(currency) => {
                        setTenderCurrency(currency);
                        fillPaymentDefaults(currency);
                    }}
                    onCashInput={setCashInput}
                    onCardInput={setCardInput}
                    onComplete={completePayment}
                    onClose={() => setPaymentOpen(false)}
                />
            )}

            {showPinGate && (
                <PinGate
                    pinInput={pinInput}
                    pinError={pinError}
                    onPinInput={setPinInput}
                    onSubmit={submitPin}
                    onClose={() => {
                        setShowPinGate(false);
                        setPendingManagerAction(null);
                    }}
                />
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
