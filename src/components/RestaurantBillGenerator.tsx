import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import './restaurant-bill-generator.css';
import {
    createId,
    createTable,
    PLACEHOLDER_IMAGE,
} from './bill/defaults';
import GuestBillModal from './bill/GuestBillModal';
import { Icon } from './bill/Icons';
import {
    buildSnapshot,
    collectOrderNumbers,
    computeBill,
    computePayment,
    decodeSnapshot,
    formatDual,
    salesForDay,
    salesToCsv,
    setActiveXcgRate,
    usdCentsToXcgCents,
} from './bill/math';
import ModifierModal from './bill/ModifierModal';
import NotificationCenter from './bill/NotificationCenter';
import OrderPanel from './bill/OrderPanel';
import PaymentModal, {
    paymentInputsToUsd,
    type TenderCurrency,
} from './bill/PaymentModal';
import PinGate from './bill/PinGate';
import { applySendFoodToKitchen, canGuestTakePayment, queueDraftBeverages } from './bill/posLogic';
import ReceiptView from './bill/ReceiptView';
import {
    canAccessView,
    canClearOrder,
    canCreateOrders,
    canDeleteMenuItems,
    canDeletePayments,
    canDeleteTickets,
    canGenerateBill,
    canManageMenu,
    canManageUsers,
    canReopenTable,
    canRunKitchenBoard,
    canSendToKitchen,
    canTakePayment,
    canUpdateBeverageStatus,
    canVoidKitchenItems,
    DEFAULT_VIEW_BY_ROLE,
    ROLE_LABELS,
    roleHelpText,
    viewsForRole,
} from './bill/roles';
import ServiceMenu from './bill/ServiceMenu';
import {
    createStaffUser,
    findStaffByPin,
    loadState,
    notificationsForStaff,
    touchState,
} from './bill/storage';
import { isBeverageItem, isKitchenBoundItem } from './bill/statusUi';
import TableMap from './bill/TableMap';
import { useDebouncedSave } from './bill/useDebouncedSave';
import { usePosSync } from './bill/usePosSync';
import { useReadyAlerts } from './bill/useReadyAlerts';
import {
    type AppView,
    type BillSnapshot,
    type FilterCategory,
    type KitchenStatus,
    type MenuItem,
    type PaymentMethod,
    type PersistedState,
    type PosSettings,
    type SelectedModifier,
    type StaffRole,
    type TableOrder,
    type TipAmountPreset,
} from './bill/types';

const KitchenBoard = lazy(() => import('./bill/KitchenBoard'));
const SalesReport = lazy(() => import('./bill/SalesReport'));
const AdminPanel = lazy(() => import('./bill/AdminPanel'));
const UsersPanel = lazy(() => import('./bill/UsersPanel'));

const VIEW_LABELS: Record<AppView, string> = {
    service: 'Service',
    kitchen: 'Kitchen',
    reports: 'Sales',
    admin: 'Menu',
    users: 'Users',
};

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
    const [view, setView] = useState<AppView>('service');
    const [category, setCategory] = useState<FilterCategory>('All');
    const [search, setSearch] = useState('');
    const [receipt, setReceipt] = useState<BillSnapshot | null>(null);
    const [guestBillOpen, setGuestBillOpen] = useState(false);
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
    const [notifOpen, setNotifOpen] = useState(false);

    useDebouncedSave(state, hydrated, 400);
    usePosSync(state, setState, hydrated);

    const commit = (updater: (current: PersistedState) => PersistedState) => {
        setState((current) => touchState(updater(current)));
    };

    useEffect(() => {
        const initial = loadState();
        setState(initial);
        setActiveXcgRate(initial.settings.xcgPerUsd);
        const initialStaff =
            initial.staff.find((entry) => entry.id === initial.activeStaffId) ?? initial.staff[0];
        setView(DEFAULT_VIEW_BY_ROLE[initialStaff.role]);
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

    const staff =
        state.staff.find((entry) => entry.id === state.activeStaffId) ?? state.staff[0];
    const allowedViews = useMemo(() => viewsForRole(staff.role), [staff.role]);
    const visibleNotifications = useMemo(
        () => notificationsForStaff(state.notifications, staff),
        [state.notifications, staff],
    );

    useEffect(() => {
        if (!canAccessView(staff.role, view)) {
            setView(DEFAULT_VIEW_BY_ROLE[staff.role]);
        }
    }, [staff.role, view]);

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
        () =>
            activeTable.lines.filter((line) => {
                if (line.kitchenStatus !== 'draft') return false;
                return isKitchenBoundItem(menuById.get(line.menuItemId));
            }).length,
        [activeTable.lines, menuById],
    );
    const isPaid = activeTable.status === 'paid';
    const { flashIds, banner: readyBanner } = useReadyAlerts(
        state.tables,
        menuById,
        hydrated && staff.role !== 'kitchen',
    );

    useEffect(() => {
        setActiveXcgRate(state.settings.xcgPerUsd);
    }, [state.settings.xcgPerUsd]);

    const updateActiveTable = (updater: (table: TableOrder) => TableOrder) => {
        commit((current) => ({
            ...current,
            tables: current.tables.map((table) =>
                table.id === current.activeTableId ? updater(table) : table,
            ),
        }));
    };

    const switchStaff = (staffId: string) => {
        const next = state.staff.find((entry) => entry.id === staffId);
        if (!next) return;
        setState((current) => ({ ...current, activeStaffId: staffId }));
        setView(DEFAULT_VIEW_BY_ROLE[next.role]);
        setReceipt(null);
        setPaymentOpen(false);
        setGuestBillOpen(false);
        setModifierItem(null);
        setNotifOpen(false);
        setShareFeedback(`Signed in as ${next.name} (${ROLE_LABELS[next.role]}).`);
    };

    const requireManager = (action: () => void) => {
        if (staff.role === 'manager') {
            action();
            return;
        }
        setPendingManagerAction(() => action);
        setPinInput('');
        setPinError(null);
        setShowPinGate(true);
    };

    const submitPin = () => {
        const match = findStaffByPin(state.staff, pinInput.trim());
        if (!match) {
            setPinError('Invalid PIN. Check Users for available staff PINs.');
            return;
        }
        if (pendingManagerAction && match.role !== 'manager') {
            setPinError('Manager PIN required for that action.');
            return;
        }
        setState((current) => ({ ...current, activeStaffId: match.id }));
        setView(DEFAULT_VIEW_BY_ROLE[match.role]);
        setShowPinGate(false);
        if (pendingManagerAction && match.role === 'manager') pendingManagerAction();
        setPendingManagerAction(null);
        setPinInput('');
        setPinError(null);
        setShareFeedback(`Signed in as ${match.name} (${ROLE_LABELS[match.role]}).`);
    };

    const openModifierModal = (item: MenuItem) => {
        if (isPaid || !canCreateOrders(staff.role)) return;
        const defaults: Record<string, string[]> = {};
        item.modifierGroups.forEach((group) => {
            defaults[group.id] = group.multi ? [] : group.options[0] ? [group.options[0].id] : [];
        });
        setSelectedMods(defaults);
        setLineNote('');
        setModifierItem(item);
    };

    const cancelAddOrder = () => {
        setModifierItem(null);
        setLineNote('');
        setSelectedMods({});
        setShareFeedback('Add order cancelled.');
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
            guestBillApprovedAt: null,
            guestSignatureDataUrl: null,
            guestPreferredPayment: null,
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
                    orderNumber: null,
                    sentByStaffId: null,
                },
            ],
        }));
        setModifierItem(null);
    };

    const changeQuantity = (lineId: string, change: number) => {
        if (isPaid || !canCreateOrders(staff.role)) return;
        const line = activeTable.lines.find((entry) => entry.id === lineId);
        const apply = () =>
            updateActiveTable((table) => ({
                ...table,
                billGeneratedAt: null,
                guestBillApprovedAt: null,
                lines: table.lines
                    .map((entry) =>
                        entry.id === lineId ? { ...entry, quantity: entry.quantity + change } : entry,
                    )
                    .filter((entry) => entry.quantity > 0),
            }));
        if (line && line.kitchenStatus !== 'draft' && change < 0) {
            if (!canVoidKitchenItems(staff.role)) {
                requireManager(apply);
                return;
            }
        }
        apply();
    };

    const deleteLine = (lineId: string) => {
        const line = activeTable.lines.find((entry) => entry.id === lineId);
        if (!line) return;
        const apply = () =>
            updateActiveTable((table) => ({
                ...table,
                billGeneratedAt: null,
                guestBillApprovedAt: null,
                lines: table.lines.filter((entry) => entry.id !== lineId),
            }));
        if (line.kitchenStatus !== 'draft' && !canDeleteTickets(staff.role)) {
            requireManager(apply);
            return;
        }
        if (line.kitchenStatus !== 'draft' && canDeleteTickets(staff.role)) {
            apply();
            return;
        }
        if (line.kitchenStatus === 'draft' && canCreateOrders(staff.role)) {
            apply();
        }
    };

    const setKitchenStatus = (tableId: string, lineId: string, kitchenStatus: KitchenStatus) => {
        if (!canRunKitchenBoard(staff.role)) {
            setShareFeedback('Kitchen role required to update ticket status.');
            return;
        }
        const targetTable = state.tables.find((table) => table.id === tableId);
        const targetLine = targetTable?.lines.find((line) => line.id === lineId);
        const targetItem = targetLine ? menuById.get(targetLine.menuItemId) : null;
        if (isBeverageItem(targetItem)) {
            setShareFeedback('Beverages are managed by the server, not the kitchen board.');
            return;
        }
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

    const setBeverageStatus = (lineId: string, kitchenStatus: KitchenStatus) => {
        if (!canUpdateBeverageStatus(staff.role)) {
            setShareFeedback('Server role required to update beverage status.');
            return;
        }
        if (!activeTable.billGeneratedAt) {
            setShareFeedback('Generate a guest ticket before updating beverage status.');
            return;
        }
        const line = activeTable.lines.find((entry) => entry.id === lineId);
        const item = line ? menuById.get(line.menuItemId) : null;
        if (!isBeverageItem(item)) {
            setShareFeedback('Only beverages can be updated this way.');
            return;
        }
        updateActiveTable((table) => ({
            ...table,
            lines: table.lines.map((entry) =>
                entry.id === lineId ? { ...entry, kitchenStatus } : entry,
            ),
        }));
        setShareFeedback(`Beverage marked ${kitchenStatus}.`);
    };

    const deleteKitchenTicket = (tableId: string, lineId: string) => {
        if (staff.role === 'kitchen') {
            setShareFeedback('Kitchen staff cannot delete tickets. Ask a Manager.');
            return;
        }
        const apply = () =>
            setState((current) => ({
                ...current,
                tables: current.tables.map((table) =>
                    table.id !== tableId
                        ? table
                        : {
                              ...table,
                              billGeneratedAt: null,
                              guestBillApprovedAt: null,
                              lines: table.lines.filter((line) => line.id !== lineId),
                          },
                ),
            }));
        if (!canDeleteTickets(staff.role)) {
            requireManager(apply);
            return;
        }
        apply();
        setShareFeedback('Kitchen ticket deleted.');
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

    const openGuestBill = () => {
        if (!itemCount || isPaid || !canTakePayment(staff.role)) return;
        const generatedAt = activeTable.billGeneratedAt ?? new Date().toISOString();
        updateActiveTable((table) => {
            const withTicket = {
                ...table,
                billGeneratedAt: table.billGeneratedAt ?? generatedAt,
            };
            return queueDraftBeverages(withTicket, menuById, staff.id);
        });
        setGuestBillOpen(true);
        setShareFeedback('Guest ticket generated. Beverages queued for server status updates.');
    };

    const openPayment = () => {
        if (!itemCount || isPaid) return;
        if (!canGuestTakePayment(activeTable)) {
            setShareFeedback('Guest must review, sign, and tick a payment option first.');
            openGuestBill();
            return;
        }
        setPayMethod(activeTable.guestPreferredPayment ?? 'card');
        setTenderCurrency('USD');
        fillPaymentDefaults('USD');
        setPaymentOpen(true);
    };

    const cancelPayment = () => {
        setPaymentOpen(false);
        setShareFeedback('Payment cancelled.');
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
        const orderNumbers = collectOrderNumbers(activeTable.lines);
        commit((current) => ({
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
                    serviceChargeCents: bill.serviceChargeCents,
                    tipCents: bill.tipCents,
                    totalCents: bill.totalCents,
                    payment,
                    serverName: staff.name,
                    itemCount,
                    orderNumbers,
                },
                ...current.sales,
            ],
        }));
        setPaymentOpen(false);
        setGuestBillOpen(false);
        setShareFeedback(
            `Paid with ${payment.method} (${tenderCurrency}). Change due: ${formatDual(payment.changeDueCents)}.`,
        );
    };

    const sendToKitchen = () => {
        if (!draftCount || isPaid || !canSendToKitchen(staff.role)) return;
        let sentCount = 0;
        commit((current) => {
            const result = applySendFoodToKitchen(current, menuById);
            sentCount = result.sentCount;
            return result.state;
        });
        if (sentCount === 0) {
            setShareFeedback('No food drafts to send. Beverages stay with the server.');
            return;
        }
        setShareFeedback(
            `${sentCount} food item(s) sent to kitchen. Beverages are not sent — queue them via guest ticket.`,
        );
        setNotifOpen(true);
    };

    const generateBill = () => {
        if (!itemCount || isPaid) return;
        const generatedAt = new Date().toISOString();
        const nextTable = queueDraftBeverages(
            {
                ...activeTable,
                billGeneratedAt: generatedAt,
            },
            menuById,
            staff.id,
        );
        updateActiveTable(() => nextTable);
        setReceipt(buildSnapshot(nextTable, state.menu, state.restaurant, staff.name));
        setShareFeedback('Guest ticket generated. Beverages queued for server status updates.');
    };

    const markNotifRead = (id: string) => {
        setState((current) => ({
            ...current,
            notifications: current.notifications.map((n) =>
                n.id === id && !n.readBy.includes(staff.id)
                    ? { ...n, readBy: [...n.readBy, staff.id] }
                    : n,
            ),
        }));
    };

    const markAllNotifsRead = () => {
        const visibleIds = new Set(visibleNotifications.map((n) => n.id));
        setState((current) => ({
            ...current,
            notifications: current.notifications.map((n) =>
                visibleIds.has(n.id) && !n.readBy.includes(staff.id)
                    ? { ...n, readBy: [...n.readBy, staff.id] }
                    : n,
            ),
        }));
    };

    const deleteSale = (saleId: string) => {
        const apply = () =>
            setState((current) => ({
                ...current,
                sales: current.sales.filter((sale) => sale.id !== saleId),
            }));
        if (!canDeletePayments(staff.role)) {
            requireManager(apply);
            return;
        }
        apply();
        setShareFeedback('Payment / sale deleted.');
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

    const guestBillSnapshot = useMemo(
        () => buildSnapshot(activeTable, state.menu, state.restaurant, staff.name),
        [activeTable, state.menu, state.restaurant, staff.name],
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
                        <small>Kitchen &amp; Bar · USD/XCG</small>
                    </span>
                </a>
                <div className="service-status">
                    <span className={`status-dot ${isPaid ? 'paid' : ''}`} />
                    <span>
                        {staff.role === 'kitchen'
                            ? 'Kitchen station'
                            : isPaid
                              ? 'Table paid'
                              : 'Open for service'}
                    </span>
                    {staff.role !== 'kitchen' && (
                        <>
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
                                        setGuestBillOpen(false);
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
                        </>
                    )}
                    <span className="status-divider" />
                    <span className={`online-pill ${online ? 'on' : 'off'}`}>
                        <Icon name="wifi" /> {online ? 'Online' : 'Offline'}
                    </span>
                    <span className="status-divider" />
                    <span className="sync-pill" title="Open Kitchen in another tab to demo multi-station sync">
                        Tabs sync
                    </span>
                </div>
                <div className="top-actions">
                    <NotificationCenter
                        notifications={visibleNotifications}
                        staffId={staff.id}
                        open={notifOpen}
                        onToggle={() => setNotifOpen((open) => !open)}
                        onMarkRead={markNotifRead}
                        onMarkAllRead={markAllNotifsRead}
                    />
                    <div className="mode-toggle" role="group" aria-label="Workspace mode">
                        {allowedViews.map((key) => (
                            <button
                                key={key}
                                type="button"
                                className={view === key ? 'active' : ''}
                                onClick={() => setView(key)}
                            >
                                {key === 'kitchen' && <Icon name="chef" />}
                                {key === 'reports' && <Icon name="chart" />}
                                {key === 'admin' && <Icon name="settings" />}
                                {key === 'users' && <Icon name="users" />}
                                {VIEW_LABELS[key]}
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
                                {ROLE_LABELS[staff.role]} · switch
                            </small>
                        </span>
                    </button>
                </div>
            </header>

            {readyBanner && (
                <div className="ready-banner" role="status">
                    <strong>{readyBanner}</strong>
                </div>
            )}

            <main className={`workspace ${view !== 'service' ? 'wide-main' : ''}`}>
                {view === 'service' && canAccessView(staff.role, 'service') && (
                    <>
                        <div className="service-sidebar-tools">
                            <TableMap
                                tables={state.tables}
                                activeTableId={activeTable.id}
                                onSelect={(tableId) => {
                                    commit((current) => ({ ...current, activeTableId: tableId }));
                                    setReceipt(null);
                                    setGuestBillOpen(false);
                                }}
                            />
                        </div>
                        <ServiceMenu
                            menu={state.menu}
                            activeTable={activeTable}
                            category={category}
                            search={search}
                            isPaid={isPaid || !canCreateOrders(staff.role)}
                            flashLineIds={flashIds}
                            onCategory={setCategory}
                            onSearch={setSearch}
                            onAdd={openModifierModal}
                        />
                    </>
                )}

                {view === 'kitchen' && canAccessView(staff.role, 'kitchen') && (
                    <Suspense fallback={<ViewFallback />}>
                        <KitchenBoard
                            tables={state.tables}
                            menuById={menuById}
                            canDeleteTickets={
                                canDeleteTickets(staff.role) && staff.role !== 'kitchen'
                            }
                            onStatus={setKitchenStatus}
                            onDeleteTicket={deleteKitchenTicket}
                        />
                    </Suspense>
                )}

                {view === 'reports' && canAccessView(staff.role, 'reports') && (
                    <Suspense fallback={<ViewFallback />}>
                        <SalesReport
                            sales={todaySales}
                            settings={state.settings}
                            canDeletePayments={canDeletePayments(staff.role)}
                            onExport={exportSales}
                            onDeleteSale={deleteSale}
                            onOpenShift={() =>
                                commit((current) => ({
                                    ...current,
                                    settings: {
                                        ...current.settings,
                                        shiftOpenedAt: new Date().toISOString(),
                                        shiftClosedAt: null,
                                    },
                                }))
                            }
                            onCloseShift={() =>
                                commit((current) => ({
                                    ...current,
                                    settings: {
                                        ...current.settings,
                                        shiftClosedAt: new Date().toISOString(),
                                    },
                                }))
                            }
                        />
                    </Suspense>
                )}

                {view === 'users' && canManageUsers(staff.role) && (
                    <Suspense fallback={<ViewFallback />}>
                        <UsersPanel
                            staff={state.staff}
                            activeStaffId={staff.id}
                            currentRole={staff.role}
                            onCreate={({ name, role, pin }) => {
                                if (!canManageUsers(staff.role)) return 'Not allowed.';
                                const trimmedName = name.trim();
                                const trimmedPin = pin.trim();
                                if (trimmedName.length < 2) return 'Enter a full name.';
                                if (!/^\d{4,8}$/.test(trimmedPin)) {
                                    return 'PIN must be 4–8 digits.';
                                }
                                if (state.staff.some((user) => user.pin === trimmedPin)) {
                                    return 'That PIN is already in use.';
                                }
                                if (role === 'manager' && staff.role !== 'manager') {
                                    return 'Only a manager can create another manager.';
                                }
                                const user = createStaffUser({
                                    name: trimmedName,
                                    role: role as StaffRole,
                                    pin: trimmedPin,
                                });
                                setState((current) => ({
                                    ...current,
                                    staff: [...current.staff, user],
                                }));
                                return null;
                            }}
                            onDelete={(id) => {
                                if (id === staff.id) return 'Cannot delete the signed-in user.';
                                const target = state.staff.find((user) => user.id === id);
                                if (!target) return 'User not found.';
                                if (target.role === 'manager' && staff.role !== 'manager') {
                                    return 'Only a manager can delete a manager.';
                                }
                                if (state.staff.length <= 1) return 'At least one user is required.';
                                setState((current) => ({
                                    ...current,
                                    staff: current.staff.filter((user) => user.id !== id),
                                }));
                                return null;
                            }}
                            onSwitchUser={switchStaff}
                        />
                    </Suspense>
                )}

                {view === 'admin' && canManageMenu(staff.role) && (
                    <Suspense fallback={<ViewFallback />}>
                        <AdminPanel
                            menu={state.menu}
                            tables={state.tables}
                            activeTableId={activeTable.id}
                            menuForm={menuForm}
                            editingId={editingId}
                            newTableLabel={newTableLabel}
                            settings={state.settings}
                            onFormChange={setMenuForm}
                            onSettingsChange={(patch: Partial<PosSettings>) => {
                                commit((current) => ({
                                    ...current,
                                    settings: { ...current.settings, ...patch },
                                }));
                                if (typeof patch.xcgPerUsd === 'number') {
                                    setActiveXcgRate(patch.xcgPerUsd);
                                }
                            }}
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
                            onDeleteItem={(id) => {
                                const remove = () => {
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
                                };
                                if (canDeleteMenuItems(staff.role)) remove();
                                else requireManager(remove);
                            }}
                            onNewTableLabel={setNewTableLabel}
                            onAddTable={() => {
                                const label =
                                    newTableLabel.trim() || `Table ${state.tables.length + 1}`;
                                const table = createTable(
                                    label,
                                    state.settings.defaultServiceChargePercent,
                                );
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
                                setGuestBillOpen(false);
                            }}
                        />
                    </Suspense>
                )}

                {view === 'service' && canAccessView(staff.role, 'service') && (
                    <OrderPanel
                        activeTable={activeTable}
                        menuById={menuById}
                        bill={bill}
                        itemCount={itemCount}
                        draftCount={draftCount}
                        isPaid={isPaid}
                        shareFeedback={shareFeedback}
                        canClear={canClearOrder(staff.role)}
                        canSendKitchen={canSendToKitchen(staff.role)}
                        canGenerateBill={canGenerateBill(staff.role)}
                        canTakePayment={canTakePayment(staff.role)}
                        canReopen={canReopenTable(staff.role)}
                        canDeleteTickets={canDeleteTickets(staff.role)}
                        canUpdateBeverageStatus={canUpdateBeverageStatus(staff.role)}
                        flashLineIds={flashIds}
                        onClear={() => {
                            if (!canClearOrder(staff.role)) {
                                requireManager(() =>
                                    updateActiveTable((table) => ({
                                        ...table,
                                        lines: [],
                                        billGeneratedAt: null,
                                        guestBillApprovedAt: null,
                                        guestSignatureDataUrl: null,
                                        guestPreferredPayment: null,
                                    })),
                                );
                                return;
                            }
                            updateActiveTable((table) => ({
                                ...table,
                                lines: [],
                                billGeneratedAt: null,
                                guestBillApprovedAt: null,
                                guestSignatureDataUrl: null,
                                guestPreferredPayment: null,
                            }));
                        }}
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
                        onDeleteLine={deleteLine}
                        onBeverageStatus={setBeverageStatus}
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
                        onTipPreset={(preset: TipAmountPreset) => {
                            if (isPaid) return;
                            updateActiveTable((table) => ({
                                ...table,
                                tipAmountPreset: preset,
                                tipCents: preset === 'custom' ? table.tipCents : preset,
                                billGeneratedAt: null,
                                guestBillApprovedAt: null,
                            }));
                        }}
                        onCustomTipDollars={(value) =>
                            updateActiveTable((table) => ({
                                ...table,
                                tipAmountPreset: 'custom',
                                tipCents: Math.max(0, Math.round(value * 100)),
                                billGeneratedAt: null,
                                guestBillApprovedAt: null,
                            }))
                        }
                        onServiceChargeEnabled={(enabled) =>
                            updateActiveTable((table) => ({
                                ...table,
                                serviceChargeEnabled: enabled,
                                billGeneratedAt: null,
                                guestBillApprovedAt: null,
                            }))
                        }
                        onServiceChargePercent={(value) =>
                            updateActiveTable((table) => ({
                                ...table,
                                serviceChargePercent: value,
                                billGeneratedAt: null,
                                guestBillApprovedAt: null,
                            }))
                        }
                        onSendKitchen={sendToKitchen}
                        onGenerateBill={() => {
                            if (!canGenerateBill(staff.role)) return;
                            generateBill();
                        }}
                        onGuestBill={openGuestBill}
                        onTakePayment={() => {
                            if (!canTakePayment(staff.role)) return;
                            openPayment();
                        }}
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
                        onReopen={() => {
                            const reopen = () =>
                                updateActiveTable((table) => ({
                                    ...table,
                                    status: 'open',
                                    paidAt: null,
                                    payment: null,
                                    billGeneratedAt: null,
                                    guestBillApprovedAt: null,
                                    guestSignatureDataUrl: null,
                                    guestPreferredPayment: null,
                                    lines: [],
                                }));
                            if (!canReopenTable(staff.role)) {
                                requireManager(reopen);
                                return;
                            }
                            reopen();
                        }}
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
                    onCancel={cancelAddOrder}
                />
            )}

            {guestBillOpen && (
                <GuestBillModal
                    snapshot={guestBillSnapshot}
                    preferredPayment={activeTable.guestPreferredPayment}
                    signatureDataUrl={activeTable.guestSignatureDataUrl}
                    onPreferredPayment={(method) =>
                        updateActiveTable((table) => ({
                            ...table,
                            guestPreferredPayment: method,
                        }))
                    }
                    onSignature={(dataUrl) =>
                        updateActiveTable((table) => ({
                            ...table,
                            guestSignatureDataUrl: dataUrl,
                        }))
                    }
                    onApproveAndCollect={() => {
                        const method = activeTable.guestPreferredPayment;
                        if (!method) {
                            setShareFeedback('Tick a payment option and sign before collecting.');
                            return;
                        }
                        updateActiveTable((table) => ({
                            ...table,
                            guestBillApprovedAt: new Date().toISOString(),
                            guestPreferredPayment: method,
                            billGeneratedAt: table.billGeneratedAt ?? new Date().toISOString(),
                        }));
                        setGuestBillOpen(false);
                        setPayMethod(method);
                        setTenderCurrency('USD');
                        fillPaymentDefaults('USD');
                        setPaymentOpen(true);
                        setShareFeedback('Guest approved the bill. Collect payment.');
                    }}
                    onCancel={() => {
                        setGuestBillOpen(false);
                        setShareFeedback('Guest bill review cancelled.');
                    }}
                />
            )}

            {paymentOpen && (
                <PaymentModal
                    totalCents={bill.totalCents}
                    payMethod={payMethod}
                    tenderCurrency={tenderCurrency}
                    cashInput={cashInput}
                    cardInput={cardInput}
                    preferredMethod={activeTable.guestPreferredPayment}
                    onMethod={setPayMethod}
                    onCurrency={(currency) => {
                        setTenderCurrency(currency);
                        fillPaymentDefaults(currency);
                    }}
                    onCashInput={setCashInput}
                    onCardInput={setCardInput}
                    onComplete={completePayment}
                    onCancel={cancelPayment}
                />
            )}

            {showPinGate && (
                <PinGate
                    pinInput={pinInput}
                    pinError={pinError}
                    helpText="Enter your staff PIN to switch users or authorize a manager action."
                    demoCredentials={roleHelpText(state.staff)}
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
