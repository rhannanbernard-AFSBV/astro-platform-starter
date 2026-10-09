import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import './restaurant-bill-generator.css';
import {
    createBarTab,
    createId,
    createTable,
    ensureCoreModifierGroups,
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
    effectiveMenuPriceCents,
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
import ChangePinModal from './bill/ChangePinModal';
import PinGate from './bill/PinGate';
import {
    allGuestsPaid,
    appendAudit,
    applySendDrinksToBar,
    applySendFoodToKitchen,
    bumpKitchenLine,
    canGuestTakePayment,
    drinkDraftLineIds,
    fireHeldLines,
    parseStationParam,
    recallKitchenLine,
    setLineCourseFire,
} from './bill/posLogic';
import ReceiptView from './bill/ReceiptView';
import {
    canAccessView,
    canClearOrder,
    canCompLine,
    canCreateOrders,
    canDeleteMenuItems,
    canDeletePayments,
    canDeleteTickets,
    canEightySix,
    canGenerateBill,
    canManageMenu,
    canManageUsers,
    canOpenBarTab,
    canReopenTable,
    canRunBarBoard,
    canRunKitchenBoard,
    canSendToBar,
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
import {
    changePin,
    createOwnerBackup,
    downloadLatestBackup,
    fetchOwnerSummary,
    fetchPosConfig,
    fetchPosState,
    formatApiError,
    getStoredToken,
    isServerMode,
    loginWithPin,
    postAuditRemote,
    probePosHealth,
    recordSale,
    setStoredToken,
    voidSaleRemote,
    type OwnerSummary,
    type PosSession,
} from './bill/posApi';
import { isBeverageItem, isKitchenBoundItem } from './bill/statusUi';
import TableMap from './bill/TableMap';
import { useDebouncedSave } from './bill/useDebouncedSave';
import { useIdleLock } from './bill/useIdleLock';
import { usePosServer } from './bill/usePosServer';
import { usePosSync } from './bill/usePosSync';
import { useReadyAlerts } from './bill/useReadyAlerts';
import VoidReasonModal from './bill/VoidReasonModal';
import {
    type AppView,
    type AuditEntry,
    type BillSnapshot,
    type CourseFire,
    type FilterCategory,
    type KitchenStatus,
    type MenuItem,
    type PaymentMethod,
    type PersistedState,
    type PosSettings,
    type ReceiptTemplate,
    type SaleRecord,
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
    bar: 'Bar',
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
        eightySixed: false,
        happyHour: null,
        modifierGroups: ensureCoreModifierGroups([]),
    };
}

function sanitizeMenuForm(form: Omit<MenuItem, 'id'>): Omit<MenuItem, 'id'> {
    const groups = ensureCoreModifierGroups(form.modifierGroups).map((group) => {
        const options = group.options
            .map((option) => ({ ...option, name: option.name.trim() }))
            .filter((option) => option.name.length > 0);
        return {
            ...group,
            options:
                options.length > 0
                    ? options
                    : [
                          {
                              id: createId(group.id),
                              name: group.id === 'prep' ? 'As prepared' : 'House side',
                              priceDeltaCents: 0,
                          },
                      ],
        };
    });
    const hh = form.happyHour;
    const happyHour =
        hh &&
        Number.isFinite(hh.priceCents) &&
        hh.priceCents >= 0 &&
        Number.isFinite(hh.startHour) &&
        Number.isFinite(hh.endHour)
            ? {
                  priceCents: Math.max(0, Math.round(hh.priceCents)),
                  startHour: Math.min(23, Math.max(0, Math.round(hh.startHour))),
                  endHour: Math.min(23, Math.max(0, Math.round(hh.endHour))),
                  daysOfWeek: hh.daysOfWeek,
              }
            : null;
    return {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        eightySixed: form.eightySixed === true,
        happyHour,
        modifierGroups: groups,
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
    const [payGuestId, setPayGuestId] = useState<string | null>(null);
    const [notifOpen, setNotifOpen] = useState(false);
    const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate>('guest');
    const [voidPending, setVoidPending] = useState<null | {
        kind: AuditEntry['kind'];
        title: string;
        details: string;
        tableLabel: string | null;
        mode: 'void' | 'comp';
        apply: (reason: string) => void;
    }>(null);
    const [posSession, setPosSession] = useState<PosSession | null>(null);
    const [serverRevision, setServerRevision] = useState<number | null>(null);
    const [mustChangePin, setMustChangePin] = useState(false);
    const [changePinError, setChangePinError] = useState<string | null>(null);
    const [changePinBusy, setChangePinBusy] = useState(false);
    const [hideDemoCredentials, setHideDemoCredentials] = useState(false);
    const [ownerOps, setOwnerOps] = useState<OwnerSummary | null>(null);
    const serverMode = isServerMode();

    useDebouncedSave(state, hydrated && !serverMode, 400);
    usePosSync(state, setState, hydrated && !serverMode);
    const { serverOnline, syncError } = usePosServer({
        hydrated,
        session: posSession && !mustChangePin ? posSession : null,
        state,
        setState,
        revision: serverRevision,
        setRevision: setServerRevision,
    });

    const { locked: idleLocked, unlock: unlockIdle, lockNow } = useIdleLock({
        enabled: hydrated && Boolean(posSession || !serverMode) && !mustChangePin && !showPinGate,
        idleMinutes: state.settings.idleLockMinutes,
    });

    const commit = (updater: (current: PersistedState) => PersistedState) => {
        setState((current) => touchState(updater(current)));
    };

    useEffect(() => {
        let cancelled = false;
        const boot = async () => {
            const local = loadState();
            setOnline(navigator.onLine);
            const onOnline = () => setOnline(true);
            const onOffline = () => setOnline(false);
            window.addEventListener('online', onOnline);
            window.addEventListener('offline', onOffline);

            const hash = window.location.hash;
            if (hash.startsWith('#bill=')) {
                const snapshot = decodeSnapshot(hash.slice(6));
                if (snapshot) {
                    setReceipt(snapshot);
                    setReceiptTemplate(snapshot.template ?? 'guest');
                }
            }

            if (serverMode) {
                const config = await fetchPosConfig();
                if (config?.hideDemoCredentials) setHideDemoCredentials(true);
                const healthy = await probePosHealth();
                if (!healthy) {
                    setShareFeedback(
                        'POS server unreachable. Start the API (see backend/README) or unset PUBLIC_POS_API_URL for local demo mode.',
                    );
                    setState(local);
                    setActiveXcgRate(local.settings.xcgPerUsd);
                    setShowPinGate(true);
                    setHydrated(true);
                    return () => {
                        window.removeEventListener('online', onOnline);
                        window.removeEventListener('offline', onOffline);
                    };
                }
                const token = getStoredToken();
                if (token) {
                    try {
                        const remote = await fetchPosState();
                        if (cancelled) return;
                        setServerRevision(remote.revision);
                        setMustChangePin(Boolean(remote.mustChangePin));
                        const staffId =
                            remote.state.staff.find((s) => s.id === remote.state.activeStaffId)?.id ??
                            remote.state.staff[0]?.id;
                        setState(
                            touchState({
                                ...remote.state,
                                activeStaffId: staffId ?? remote.state.activeStaffId,
                            }),
                        );
                        setActiveXcgRate(remote.state.settings.xcgPerUsd);
                        const active =
                            remote.state.staff.find((s) => s.id === staffId) ?? remote.state.staff[0];
                        if (active) {
                            setPosSession({
                                token,
                                expiresAt: '',
                                tenantId: '',
                                mustChangePin: Boolean(remote.mustChangePin),
                                staff: {
                                    id: active.id,
                                    name: active.name,
                                    role: active.role,
                                    initials: active.initials,
                                },
                            });
                            setView(DEFAULT_VIEW_BY_ROLE[active.role]);
                        }
                        setShowPinGate(false);
                    } catch {
                        setStoredToken(null);
                        setShowPinGate(true);
                        setState(local);
                    }
                } else {
                    setState(local);
                    setShowPinGate(true);
                }
                setHydrated(true);
                return () => {
                    window.removeEventListener('online', onOnline);
                    window.removeEventListener('offline', onOffline);
                };
            }

            // Local demo mode
            setState(local);
            setActiveXcgRate(local.settings.xcgPerUsd);
            let nextState = local;
            const params = new URLSearchParams(window.location.search);
            const station = parseStationParam(params.get('station'));
            if (station) {
                const preferredRole =
                    station === 'kitchen'
                        ? 'kitchen'
                        : station === 'bar'
                          ? 'bartender'
                          : station === 'admin' || station === 'users' || station === 'reports'
                            ? 'manager'
                            : 'server';
                const stationStaff =
                    local.staff.find((entry) => entry.role === preferredRole) ??
                    local.staff.find((entry) => canAccessView(entry.role, station)) ??
                    null;
                if (stationStaff) {
                    nextState = { ...local, activeStaffId: stationStaff.id };
                    setState(nextState);
                    setView(station);
                } else {
                    setView(DEFAULT_VIEW_BY_ROLE[local.staff[0]?.role ?? 'server']);
                }
            } else {
                const initialStaff =
                    local.staff.find((entry) => entry.id === local.activeStaffId) ?? local.staff[0];
                setView(DEFAULT_VIEW_BY_ROLE[initialStaff.role]);
            }
            setHydrated(true);
            return () => {
                window.removeEventListener('online', onOnline);
                window.removeEventListener('offline', onOffline);
            };
        };

        let cleanup: (() => void) | undefined;
        void boot().then((fn) => {
            cleanup = fn;
        });
        return () => {
            cancelled = true;
            cleanup?.();
        };
    }, [serverMode]);

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
    const drinkDraftCount = useMemo(
        () => drinkDraftLineIds(activeTable, menuById).length,
        [activeTable, menuById],
    );
    const isPaid = activeTable.status === 'paid';
    const isPartial = activeTable.status === 'partial';
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

    const refreshOwnerOps = () => {
        if (!serverMode || !posSession || mustChangePin) return;
        if (staff.role !== 'manager' && staff.role !== 'admin') return;
        void fetchOwnerSummary()
            .then(setOwnerOps)
            .catch(() => setOwnerOps(null));
    };

    useEffect(() => {
        if (view === 'reports') refreshOwnerOps();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, serverMode, posSession?.token, mustChangePin, staff.role]);

    const submitPin = () => {
        const pin = pinInput.trim();
        if (serverMode) {
            void (async () => {
                try {
                    const session = await loginWithPin(pin);
                    setPosSession(session);
                    setMustChangePin(Boolean(session.mustChangePin));
                    const remote = await fetchPosState();
                    setServerRevision(remote.revision);
                    setMustChangePin(Boolean(session.mustChangePin || remote.mustChangePin));
                    setState(
                        touchState({
                            ...remote.state,
                            activeStaffId: session.staff.id,
                        }),
                    );
                    setActiveXcgRate(remote.state.settings.xcgPerUsd);
                    setView(DEFAULT_VIEW_BY_ROLE[session.staff.role]);
                    setShowPinGate(false);
                    unlockIdle();
                    if (pendingManagerAction && session.staff.role === 'manager') {
                        pendingManagerAction();
                    } else if (pendingManagerAction && session.staff.role !== 'manager') {
                        setPinError('Manager PIN required for that action.');
                        setShowPinGate(true);
                        return;
                    }
                    setPendingManagerAction(null);
                    setPinInput('');
                    setPinError(null);
                    setShareFeedback(
                        session.mustChangePin
                            ? `Signed in as ${session.staff.name} — change the demo PIN to continue.`
                            : `Signed in as ${session.staff.name} (${ROLE_LABELS[session.staff.role]}) · server mode`,
                    );
                } catch (err) {
                    setPinError(formatApiError(err));
                }
            })();
            return;
        }

        const match = findStaffByPin(state.staff, pin);
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
        unlockIdle();
        if (pendingManagerAction && match.role === 'manager') pendingManagerAction();
        setPendingManagerAction(null);
        setPinInput('');
        setPinError(null);
        setShareFeedback(`Signed in as ${match.name} (${ROLE_LABELS[match.role]}).`);
    };

    const submitChangePin = (current: string, next: string) => {
        setChangePinBusy(true);
        setChangePinError(null);
        void changePin(current, next)
            .then(() => {
                setMustChangePin(false);
                setPosSession((session) =>
                    session ? { ...session, mustChangePin: false } : session,
                );
                setShareFeedback('PIN updated. Station unlocked for trusted floor use.');
            })
            .catch((err) => setChangePinError(formatApiError(err)))
            .finally(() => setChangePinBusy(false));
    };

    const runOwnerBackup = () => {
        void (async () => {
            try {
                const meta = await createOwnerBackup();
                await downloadLatestBackup();
                setShareFeedback(`Backup saved · ${meta.filename} (${meta.bytes} bytes)`);
                refreshOwnerOps();
            } catch (err) {
                setShareFeedback(formatApiError(err));
            }
        })();
    };

    const openModifierModal = (item: MenuItem) => {
        if (isPaid || !canCreateOrders(staff.role)) return;
        if (item.eightySixed) {
            setShareFeedback(`${item.name} is 86’d — out of stock.`);
            return;
        }
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
        if (modifierItem.eightySixed) {
            setShareFeedback(`${modifierItem.name} is 86’d — out of stock.`);
            setModifierItem(null);
            return;
        }
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
        const modTotal = modifiers.reduce((sum, mod) => sum + mod.priceDeltaCents, 0);
        const snapshot = effectiveMenuPriceCents(modifierItem) + modTotal;
        const isDrink = isBeverageItem(modifierItem);
        const autoFire =
            isDrink && state.settings.autoFireDrinks && canSendToBar(staff.role);
        let firedCount = 0;

        commit((current) => {
            const table = current.tables.find((entry) => entry.id === current.activeTableId);
            if (!table) return current;
            const unpaidGuest =
                table.guests.find((guest) => !guest.paidAt) ?? table.guests[0] ?? null;
            let next: PersistedState = {
                ...current,
                tables: current.tables.map((entry) =>
                    entry.id !== current.activeTableId
                        ? entry
                        : {
                              ...entry,
                              billGeneratedAt: null,
                              guestBillApprovedAt: null,
                              guestSignatureDataUrl: null,
                              guestPreferredPayment: null,
                              lines: [
                                  ...entry.lines,
                                  {
                                      id: createId('line'),
                                      menuItemId: modifierItem.id,
                                      quantity: 1,
                                      guestId: unpaidGuest?.id ?? null,
                                      note: lineNote.trim(),
                                      modifiers,
                                      kitchenStatus: 'draft',
                                      sentToKitchenAt: null,
                                      orderNumber: null,
                                      sentByStaffId: null,
                                      courseFire: 'fire',
                                      bumpedAt: null,
                                      bumpCount: 0,
                                      unitPriceSnapshotCents: snapshot,
                                      compReason: null,
                                  },
                              ],
                          },
                ),
            };
            if (autoFire) {
                const result = applySendDrinksToBar(next, menuById);
                next = result.state;
                firedCount = result.sentCount;
            }
            return next;
        });
        if (autoFire) {
            setShareFeedback(
                firedCount > 0
                    ? `${firedCount} drink(s) fired to the bar rail.`
                    : `${modifierItem.name} added.`,
            );
        } else if (isDrink) {
            setShareFeedback(`${modifierItem.name} added — Fire drinks when ready.`);
        }
        setModifierItem(null);
    };

    const requestVoid = (
        kind: AuditEntry['kind'],
        title: string,
        details: string,
        tableLabel: string | null,
        apply: (reason: string) => void,
        needsManager: boolean,
        mode: 'void' | 'comp' = 'void',
    ) => {
        const openVoid = () =>
            setVoidPending({ kind, title, details, tableLabel, apply, mode });
        if (needsManager) {
            requireManager(openVoid);
            return;
        }
        openVoid();
    };

    const openBarTab = (guestName: string) => {
        if (!canOpenBarTab(staff.role)) return;
        const tab = createBarTab(guestName, state.settings.defaultServiceChargePercent);
        commit((current) => ({
            ...current,
            tables: [...current.tables, tab],
            activeTableId: tab.id,
        }));
        setView('service');
        setShareFeedback(`Bar tab opened for ${guestName.trim()}.`);
    };

    const toggleEightySix = (menuItemId: string) => {
        if (!canEightySix(staff.role)) {
            setShareFeedback('Kitchen, bartender, or manager can 86 items.');
            return;
        }
        commit((current) => ({
            ...current,
            menu: current.menu.map((item) =>
                item.id === menuItemId ? { ...item, eightySixed: !item.eightySixed } : item,
            ),
        }));
        const item = menuById.get(menuItemId);
        if (item) {
            setShareFeedback(
                item.eightySixed
                    ? `${item.name} back in stock.`
                    : `${item.name} 86’d — hidden from new orders.`,
            );
        }
    };

    const requestCompLine = (lineId: string) => {
        const line = activeTable.lines.find((entry) => entry.id === lineId);
        if (!line || line.compReason) return;
        const item = menuById.get(line.menuItemId);
        if (!item) return;
        const drink = isBeverageItem(item);
        if (!canCompLine(staff.role, drink)) {
            setShareFeedback(
                drink
                    ? 'Bartender or manager can comp drinks.'
                    : 'Manager required to comp food.',
            );
            return;
        }
        const needsManager = !drink && staff.role !== 'manager' && staff.role !== 'admin';
        requestVoid(
            'comp',
            'Comp line',
            `${item.name} × ${line.quantity} · ${activeTable.label}`,
            activeTable.label,
            (reason) => {
                updateActiveTable((table) => ({
                    ...table,
                    billGeneratedAt: null,
                    guestBillApprovedAt: null,
                    lines: table.lines.map((entry) =>
                        entry.id === lineId ? { ...entry, compReason: reason } : entry,
                    ),
                }));
                setShareFeedback(`${item.name} comped · ${reason}`);
            },
            needsManager,
            'comp',
        );
    };

    const confirmVoid = (reason: string) => {
        if (!voidPending) return;
        const pending = voidPending;
        setVoidPending(null);
        pending.apply(reason);
        const entry = {
            id: createId('audit'),
            kind: pending.kind,
            reason,
            staffId: staff.id,
            staffName: staff.name,
            createdAt: new Date().toISOString(),
            details: pending.details,
            tableLabel: pending.tableLabel,
        };
        commit((current) =>
            appendAudit(current, {
                kind: pending.kind,
                reason,
                staffId: staff.id,
                staffName: staff.name,
                details: pending.details,
                tableLabel: pending.tableLabel,
            }),
        );
        if (serverMode && posSession && pending.kind !== 'void_payment') {
            void postAuditRemote(entry).catch(() => {
                setShareFeedback('Void applied locally; audit sync failed — check server.');
            });
        }
        setShareFeedback(`Void recorded: ${reason}`);
    };

    const changeQuantity = (lineId: string, change: number) => {
        if (isPaid || !canCreateOrders(staff.role)) return;
        const line = activeTable.lines.find((entry) => entry.id === lineId);
        const item = line ? menuById.get(line.menuItemId) : null;
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
            requestVoid(
                'void_line',
                'Void line quantity',
                `${item?.name ?? 'Item'} on ${activeTable.label}`,
                activeTable.label,
                () => apply(),
                !canVoidKitchenItems(staff.role),
            );
            return;
        }
        apply();
    };

    const deleteLine = (lineId: string) => {
        const line = activeTable.lines.find((entry) => entry.id === lineId);
        if (!line) return;
        const item = menuById.get(line.menuItemId);
        const apply = () =>
            updateActiveTable((table) => ({
                ...table,
                billGeneratedAt: null,
                guestBillApprovedAt: null,
                lines: table.lines.filter((entry) => entry.id !== lineId),
            }));
        if (line.kitchenStatus !== 'draft') {
            requestVoid(
                'void_ticket',
                'Void kitchen ticket',
                `${item?.name ?? 'Item'} · ${line.orderNumber ?? 'no order #'}`,
                activeTable.label,
                () => apply(),
                !canDeleteTickets(staff.role),
            );
            return;
        }
        if (canCreateOrders(staff.role)) apply();
    };

    const setKitchenStatus = (tableId: string, lineId: string, kitchenStatus: KitchenStatus) => {
        const targetTable = state.tables.find((table) => table.id === tableId);
        const targetLine = targetTable?.lines.find((line) => line.id === lineId);
        const targetItem = targetLine ? menuById.get(targetLine.menuItemId) : null;
        const isDrink = isBeverageItem(targetItem);
        if (isDrink) {
            if (!canRunBarBoard(staff.role) && !canUpdateBeverageStatus(staff.role)) {
                setShareFeedback('Bartender role required to update bar tickets.');
                return;
            }
        } else if (!canRunKitchenBoard(staff.role)) {
            setShareFeedback('Kitchen role required to update ticket status.');
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
            setShareFeedback('Bartender or server role required to update drinks.');
            return;
        }
        const line = activeTable.lines.find((entry) => entry.id === lineId);
        const item = line ? menuById.get(line.menuItemId) : null;
        if (!isBeverageItem(item)) {
            setShareFeedback('Only beverages can be updated this way.');
            return;
        }
        if (line?.kitchenStatus === 'draft') {
            setShareFeedback('Send drinks to the bar before updating status.');
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
        if (staff.role === 'kitchen' || staff.role === 'bartender') {
            setShareFeedback(
                staff.role === 'bartender'
                    ? 'Bartenders cannot void tickets. Ask a Manager.'
                    : 'Kitchen staff cannot delete tickets. Ask a Manager.',
            );
            return;
        }
        const targetTable = state.tables.find((table) => table.id === tableId);
        const targetLine = targetTable?.lines.find((line) => line.id === lineId);
        const item = targetLine ? menuById.get(targetLine.menuItemId) : null;
        const apply = () =>
            setState((current) =>
                touchState({
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
                }),
            );
        requestVoid(
            'void_ticket',
            'Void kitchen ticket',
            `${item?.name ?? 'Item'} · ${targetLine?.orderNumber ?? 'no order #'}`,
            targetTable?.label ?? null,
            () => apply(),
            !canDeleteTickets(staff.role),
        );
    };

    const bumpTicket = (tableId: string, lineId: string) => {
        const targetTable = state.tables.find((table) => table.id === tableId);
        const targetLine = targetTable?.lines.find((line) => line.id === lineId);
        const targetItem = targetLine ? menuById.get(targetLine.menuItemId) : null;
        const isDrink = isBeverageItem(targetItem);
        if (isDrink) {
            if (!canRunBarBoard(staff.role) && !canUpdateBeverageStatus(staff.role)) return;
        } else if (!canRunKitchenBoard(staff.role)) {
            return;
        }
        commit((current) => bumpKitchenLine(current, tableId, lineId, staff));
        setShareFeedback(
            isDrink
                ? 'Bar ticket bumped — wait timer reset.'
                : 'Ticket bumped — wait timer reset and kitchen notified.',
        );
    };

    const recallTicket = (tableId: string, lineId: string) => {
        const targetTable = state.tables.find((table) => table.id === tableId);
        const targetLine = targetTable?.lines.find((line) => line.id === lineId);
        const targetItem = targetLine ? menuById.get(targetLine.menuItemId) : null;
        const isDrink = isBeverageItem(targetItem);
        if (isDrink) {
            if (!canRunBarBoard(staff.role) && !canUpdateBeverageStatus(staff.role)) return;
        } else if (!canRunKitchenBoard(staff.role)) {
            return;
        }
        commit((current) => recallKitchenLine(current, tableId, lineId));
        setShareFeedback('Ticket recalled to Ready.');
    };

    const setCourseFireOnLine = (tableId: string, lineId: string, courseFire: CourseFire) => {
        commit((current) => ({
            ...current,
            tables: current.tables.map((table) =>
                table.id !== tableId ? table : setLineCourseFire(table, lineId, courseFire),
            ),
        }));
    };

    const fireAllHeld = (tableId: string) => {
        commit((current) => ({
            ...current,
            tables: current.tables.map((table) =>
                table.id !== tableId ? table : fireHeldLines(table),
            ),
        }));
        setShareFeedback('Held courses fired.');
    };

    const paymentTotalCents = useMemo(() => {
        if (!payGuestId) return bill.totalCents;
        const guest = bill.guestBreakdown.find((entry) => entry.id === payGuestId);
        return guest?.totalCents ?? bill.totalCents;
    }, [bill, payGuestId]);

    const fillPaymentDefaults = (currency: TenderCurrency, total = paymentTotalCents) => {
        if (currency === 'XCG') {
            const xcg = (usdCentsToXcgCents(total) / 100).toFixed(2);
            setCashInput(xcg);
            setCardInput(xcg);
        } else {
            const usd = (total / 100).toFixed(2);
            setCashInput(usd);
            setCardInput(usd);
        }
    };

    const openGuestBill = () => {
        if (!itemCount || isPaid || !canTakePayment(staff.role)) return;
        const generatedAt = activeTable.billGeneratedAt ?? new Date().toISOString();
        updateActiveTable((table) => ({
            ...table,
            billGeneratedAt: table.billGeneratedAt ?? generatedAt,
        }));
        setGuestBillOpen(true);
        setShareFeedback(
            drinkDraftCount > 0
                ? 'Guest reviewing bill — send drinks to the bar when ready.'
                : 'Guest reviewing bill.',
        );
    };

    const openPayment = () => {
        if (!itemCount || isPaid) return;
        if (!canGuestTakePayment(activeTable)) {
            setShareFeedback('Guest must review, sign, and tick a payment option first.');
            openGuestBill();
            return;
        }
        const unpaid = bill.guestBreakdown.filter(
            (guest) => guest.totalCents > 0 && !guest.paidAt,
        );
        const defaultGuest = unpaid.length > 1 ? unpaid[0].id : null;
        setPayGuestId(defaultGuest);
        setPayMethod(activeTable.guestPreferredPayment ?? 'card');
        setTenderCurrency('USD');
        const due =
            defaultGuest == null
                ? bill.totalCents
                : unpaid.find((guest) => guest.id === defaultGuest)?.totalCents ?? bill.totalCents;
        fillPaymentDefaults('USD', due);
        setPaymentOpen(true);
    };

    const cancelPayment = () => {
        setPaymentOpen(false);
        setPayGuestId(null);
        setShareFeedback('Payment cancelled.');
    };

    const completePayment = () => {
        const dueCents = paymentTotalCents;
        const { cashCents, cardCents } = paymentInputsToUsd(
            payMethod,
            tenderCurrency,
            cashInput,
            cardInput,
        );
        const payment = computePayment(dueCents, payMethod, cashCents, cardCents);
        if (payMethod === 'cash' && cashCents < dueCents) {
            setShareFeedback(`Cash tendered is less than the total (${formatDual(dueCents)}).`);
            return;
        }
        if (payMethod === 'mixed' && cardCents + Math.max(cashCents, 0) < dueCents) {
            setShareFeedback('Mixed tender does not cover the total.');
            return;
        }
        if (serverMode && payMethod !== 'cash' && !serverOnline) {
            setShareFeedback('Server offline — card/mixed payments require the POS API.');
            return;
        }
        const paidAt = payment.paidAt;
        const orderNumbers = collectOrderNumbers(activeTable.lines);
        const guestMeta = payGuestId
            ? bill.guestBreakdown.find((guest) => guest.id === payGuestId)
            : null;
        const saleGuest = guestMeta;
        const sale: SaleRecord = {
            id: createId('sale'),
            tableId: activeTable.id,
            tableLabel: activeTable.label,
            paidAt,
            subtotalCents: saleGuest?.subtotalCents ?? bill.subtotalCents,
            serviceChargeCents: saleGuest?.serviceChargeCents ?? bill.serviceChargeCents,
            tipCents: saleGuest?.tipCents ?? bill.tipCents,
            totalCents: dueCents,
            compCents: saleGuest ? 0 : bill.compCents,
            payment,
            serverName: staff.name,
            itemCount: saleGuest
                ? activeTable.lines
                      .filter((line) => line.guestId === saleGuest.id)
                      .reduce((sum, line) => sum + line.quantity, 0)
                : itemCount,
            orderNumbers,
            guestName: saleGuest?.name ?? null,
            guestId: saleGuest?.id ?? null,
        };

        const applyLocal = () => {
            commit((current) => {
                const tables = current.tables.map((table) => {
                    if (table.id !== current.activeTableId) return table;

                    if (payGuestId) {
                        const guests = table.guests.map((guest) =>
                            guest.id === payGuestId
                                ? { ...guest, paidAt, payment }
                                : guest,
                        );
                        const nextTable = {
                            ...table,
                            guests,
                            billGeneratedAt: table.billGeneratedAt ?? paidAt,
                        };
                        const fullyPaid = allGuestsPaid(nextTable);
                        if (fullyPaid) {
                            return {
                                ...nextTable,
                                status: 'paid' as const,
                                paidAt,
                                payment,
                                lines: nextTable.lines.map((line) =>
                                    line.kitchenStatus === 'draft'
                                        ? line
                                        : { ...line, kitchenStatus: 'served' as const },
                                ),
                            };
                        }
                        return {
                            ...nextTable,
                            status: 'partial' as const,
                            paidAt: null,
                            payment: null,
                        };
                    }

                    return {
                        ...table,
                        status: 'paid' as const,
                        paidAt,
                        payment,
                        billGeneratedAt: table.billGeneratedAt ?? paidAt,
                        guests: table.guests.map((guest) =>
                            guest.paidAt ? guest : { ...guest, paidAt, payment },
                        ),
                        lines: table.lines.map((line) =>
                            line.kitchenStatus === 'draft'
                                ? line
                                : { ...line, kitchenStatus: 'served' as const },
                        ),
                    };
                });

                return {
                    ...current,
                    tables,
                    sales: serverMode ? current.sales : [sale, ...current.sales],
                };
            });
        };

        const finish = () => {
            applyLocal();
            setPaymentOpen(false);
            setGuestBillOpen(false);
            const label = guestMeta ? guestMeta.name : 'table';
            setShareFeedback(
                `Paid ${label} with ${payment.method} (${tenderCurrency}). Change due: ${formatDual(payment.changeDueCents)}.`,
            );
            setPayGuestId(null);
        };

        if (serverMode && posSession) {
            void recordSale(sale)
                .then(() => finish())
                .catch(() => {
                    setShareFeedback('Payment not recorded on server — try again.');
                });
            return;
        }
        finish();
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
            setShareFeedback('No food drafts to send. Use Send drinks to bar for beverages.');
            return;
        }
        setShareFeedback(
            `${sentCount} food item(s) sent to kitchen. Send drinks to the bar separately.`,
        );
        setNotifOpen(true);
    };

    const sendToBar = () => {
        if (!drinkDraftCount || isPaid || !canSendToBar(staff.role)) return;
        let sentCount = 0;
        commit((current) => {
            const result = applySendDrinksToBar(current, menuById);
            sentCount = result.sentCount;
            return result.state;
        });
        if (sentCount === 0) {
            setShareFeedback('No drink drafts to send to the bar.');
            return;
        }
        setShareFeedback(`${sentCount} drink(s) fired to the bar rail.`);
        setNotifOpen(true);
    };

    const generateBill = () => {
        if (!itemCount || isPaid) return;
        const generatedAt = new Date().toISOString();
        updateActiveTable((table) => ({
            ...table,
            billGeneratedAt: generatedAt,
        }));
        const template: ReceiptTemplate =
            activeTable.status === 'paid' ? 'paid' : 'guest';
        setReceiptTemplate(template);
        setReceipt(
            buildSnapshot(
                { ...activeTable, billGeneratedAt: generatedAt },
                state.menu,
                state.restaurant,
                staff.name,
                template,
            ),
        );
        setShareFeedback(
            drinkDraftCount > 0
                ? 'Guest ticket generated. Send remaining drinks to the bar when ready.'
                : 'Guest ticket generated.',
        );
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
        const sale = state.sales.find((entry) => entry.id === saleId);
        requestVoid(
            'void_payment',
            'Void payment / sale',
            `${sale?.tableLabel ?? 'Sale'} · ${formatDual(sale?.totalCents ?? 0)}`,
            sale?.tableLabel ?? null,
            (reason) => {
                if (serverMode && posSession) {
                    void voidSaleRemote(saleId, reason)
                        .then(() =>
                            setState((current) => ({
                                ...current,
                                sales: current.sales.filter((entry) => entry.id !== saleId),
                            })),
                        )
                        .catch(() => {
                            setShareFeedback('Server void failed — sale kept on ledger.');
                        });
                    return;
                }
                setState((current) => ({
                    ...current,
                    sales: current.sales.filter((entry) => entry.id !== saleId),
                }));
            },
            !canDeletePayments(staff.role),
        );
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
        () => buildSnapshot(activeTable, state.menu, state.restaurant, staff.name, 'guest'),
        [activeTable, state.menu, state.restaurant, staff.name],
    );

    if (!hydrated) {
        return <div className="bistro-app loading-shell">Loading…</div>;
    }

    return (
        <div className="bistro-app">
            <header className="topbar">
                <a className="brand" href="/" aria-label="Authentic Jamaican Cuisine & Bar home">
                    <span className="brand-mark" aria-hidden="true">
                        A
                    </span>
                    <span>
                        <strong>Authentic Jamaican</strong>
                        <small>Cuisine &amp; Bar · country market · USD/XCG</small>
                    </span>
                </a>
                <div className="service-status">
                    <span className={`status-dot ${isPaid ? 'paid' : ''}`} />
                    <span>
                        {staff.role === 'kitchen'
                            ? 'Kitchen station'
                            : staff.role === 'bartender'
                              ? 'Bar station'
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
                                            {table.status === 'paid'
                                                ? ' · paid'
                                                : table.status === 'partial'
                                                  ? ' · partial'
                                                  : ''}
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
                    {serverMode ? (
                        <span
                            className={`sync-pill ${serverOnline ? '' : 'off'}`}
                            title={
                                syncError
                                    ? syncError
                                    : serverOnline
                                      ? 'Connected to POS API — multi-device sync on'
                                      : 'POS API offline'
                            }
                        >
                            {serverOnline ? 'Server sync' : 'Server offline'}
                        </span>
                    ) : (
                        <span
                            className="sync-pill"
                            title="Local demo mode — set PUBLIC_POS_API_URL for production server"
                        >
                            Local demo
                        </span>
                    )}
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
                                {key === 'bar' && <Icon name="receipt" />}
                                {key === 'reports' && <Icon name="chart" />}
                                {key === 'admin' && <Icon name="settings" />}
                                {key === 'users' && <Icon name="users" />}
                                {VIEW_LABELS[key]}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        className="ghost lock-station-btn"
                        title="Lock this station"
                        onClick={() => {
                            setPendingManagerAction(null);
                            setPinInput('');
                            setPinError(null);
                            lockNow();
                        }}
                    >
                        <Icon name="lock" /> Lock
                    </button>
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
                                canOpenBarTab={canOpenBarTab(staff.role)}
                                onSelect={(tableId) => {
                                    commit((current) => ({ ...current, activeTableId: tableId }));
                                    setReceipt(null);
                                    setGuestBillOpen(false);
                                }}
                                onOpenBarTab={openBarTab}
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
                            board="kitchen"
                            tables={state.tables}
                            menuById={menuById}
                            bumpAfterMinutes={state.settings.bumpAfterMinutes}
                            canDeleteTickets={
                                canDeleteTickets(staff.role) && staff.role !== 'kitchen'
                            }
                            canEightySix={canEightySix(staff.role)}
                            onStatus={setKitchenStatus}
                            onDeleteTicket={deleteKitchenTicket}
                            onBump={bumpTicket}
                            onRecall={recallTicket}
                            onCourseFire={setCourseFireOnLine}
                            onFireAllHeld={fireAllHeld}
                            onToggleEightySix={toggleEightySix}
                        />
                    </Suspense>
                )}

                {view === 'bar' && canAccessView(staff.role, 'bar') && (
                    <Suspense fallback={<ViewFallback />}>
                        <KitchenBoard
                            board="bar"
                            tables={state.tables}
                            menuById={menuById}
                            bumpAfterMinutes={state.settings.bumpAfterMinutes}
                            canDeleteTickets={
                                canDeleteTickets(staff.role) && staff.role !== 'bartender'
                            }
                            canEightySix={canEightySix(staff.role)}
                            onStatus={setKitchenStatus}
                            onDeleteTicket={deleteKitchenTicket}
                            onBump={bumpTicket}
                            onRecall={recallTicket}
                            onCourseFire={setCourseFireOnLine}
                            onFireAllHeld={fireAllHeld}
                            onToggleEightySix={toggleEightySix}
                        />
                    </Suspense>
                )}

                {view === 'reports' && canAccessView(staff.role, 'reports') && (
                    <Suspense fallback={<ViewFallback />}>
                        <SalesReport
                            sales={todaySales}
                            settings={state.settings}
                            canDeletePayments={canDeletePayments(staff.role)}
                            serverMode={serverMode}
                            ownerOps={ownerOps}
                            onExport={exportSales}
                            onDeleteSale={deleteSale}
                            onBackup={
                                serverMode && (staff.role === 'manager' || staff.role === 'admin')
                                    ? runOwnerBackup
                                    : undefined
                            }
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
                            hidePins={serverMode}
                            onCreate={({ name, role, pin }) => {
                                if (!canManageUsers(staff.role)) return 'Not allowed.';
                                const trimmedName = name.trim();
                                const trimmedPin = pin.trim();
                                if (trimmedName.length < 2) return 'Enter a full name.';
                                if (!/^\d{4,8}$/.test(trimmedPin)) {
                                    return 'PIN must be 4–8 digits.';
                                }
                                if (
                                    !serverMode &&
                                    state.staff.some((user) => user.pin === trimmedPin)
                                ) {
                                    return 'That PIN is already in use.';
                                }
                                if (role === 'manager' && staff.role !== 'manager') {
                                    return 'Only a manager can create another manager.';
                                }
                                if (serverMode && posSession) {
                                    void fetch(
                                        `${(import.meta as ImportMeta & { env?: Record<string, string> }).env?.PUBLIC_POS_API_URL?.replace(/\/$/, '')}/pos/staff`,
                                        {
                                            method: 'POST',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                Authorization: `Bearer ${posSession.token}`,
                                            },
                                            body: JSON.stringify({
                                                name: trimmedName,
                                                role,
                                                pin: trimmedPin,
                                                initials: trimmedName
                                                    .split(/\s+/)
                                                    .map((p) => p[0] ?? '')
                                                    .join('')
                                                    .slice(0, 3)
                                                    .toUpperCase(),
                                            }),
                                        },
                                    )
                                        .then((res) => {
                                            if (!res.ok) throw new Error('create failed');
                                            return fetchPosState();
                                        })
                                        .then((remote) => {
                                            setServerRevision(remote.revision);
                                            setState(
                                                touchState({
                                                    ...remote.state,
                                                    activeStaffId: staff.id,
                                                }),
                                            );
                                        })
                                        .catch(() =>
                                            setShareFeedback('Could not create user on server.'),
                                        );
                                    return null;
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
                            auditLog={state.auditLog}
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
                                const cleaned = sanitizeMenuForm(menuForm);
                                if (editingId) {
                                    setState((current) => ({
                                        ...current,
                                        menu: current.menu.map((item) =>
                                            item.id === editingId
                                                ? {
                                                      ...item,
                                                      ...cleaned,
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
                                                ...cleaned,
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
                                    eightySixed: Boolean(item.eightySixed),
                                    happyHour: item.happyHour
                                        ? { ...item.happyHour }
                                        : null,
                                    modifierGroups: ensureCoreModifierGroups(item.modifierGroups),
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
                        drinkDraftCount={drinkDraftCount}
                        isPaid={isPaid}
                        isPartial={isPartial}
                        shareFeedback={shareFeedback}
                        canClear={canClearOrder(staff.role)}
                        canSendKitchen={canSendToKitchen(staff.role)}
                        canSendBar={canSendToBar(staff.role)}
                        canGenerateBill={canGenerateBill(staff.role)}
                        canTakePayment={canTakePayment(staff.role)}
                        canReopen={canReopenTable(staff.role)}
                        canDeleteTickets={canDeleteTickets(staff.role)}
                        canUpdateBeverageStatus={canUpdateBeverageStatus(staff.role)}
                        canCompLine={(isDrink) => canCompLine(staff.role, isDrink)}
                        flashLineIds={flashIds}
                        onClear={() => {
                            if (!canClearOrder(staff.role)) {
                                requireManager(() =>
                                    updateActiveTable((table) => ({
                                        ...table,
                                        lines: [],
                                        status: 'open',
                                        billGeneratedAt: null,
                                        guestBillApprovedAt: null,
                                        guestSignatureDataUrl: null,
                                        guestPreferredPayment: null,
                                        guests: table.guests.map((guest) => ({
                                            ...guest,
                                            paidAt: null,
                                            payment: null,
                                        })),
                                    })),
                                );
                                return;
                            }
                            updateActiveTable((table) => ({
                                ...table,
                                lines: [],
                                status: 'open',
                                billGeneratedAt: null,
                                guestBillApprovedAt: null,
                                guestSignatureDataUrl: null,
                                guestPreferredPayment: null,
                                guests: table.guests.map((guest) => ({
                                    ...guest,
                                    paidAt: null,
                                    payment: null,
                                })),
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
                                        paidAt: null,
                                        payment: null,
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
                                const target = table.guests.find((guest) => guest.id === guestId);
                                if (target?.paidAt) return table;
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
                        onCompLine={requestCompLine}
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
                        onCourseFire={(lineId, courseFire) => {
                            if (isPaid) return;
                            updateActiveTable((table) => setLineCourseFire(table, lineId, courseFire));
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
                        onSendBar={sendToBar}
                        onGenerateBill={() => {
                            if (!canGenerateBill(staff.role)) return;
                            generateBill();
                        }}
                        onGuestBill={openGuestBill}
                        onTakePayment={() => {
                            if (!canTakePayment(staff.role)) return;
                            openPayment();
                        }}
                        onViewPaidReceipt={() => {
                            setReceiptTemplate('paid');
                            setReceipt(
                                buildSnapshot(
                                    activeTable,
                                    state.menu,
                                    state.restaurant,
                                    staff.name,
                                    'paid',
                                ),
                            );
                        }}
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
                                    guests: table.guests.map((guest) => ({
                                        ...guest,
                                        paidAt: null,
                                        payment: null,
                                    })),
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
                        const unpaid = bill.guestBreakdown.filter(
                            (guest) => guest.totalCents > 0 && !guest.paidAt,
                        );
                        const defaultGuest = unpaid.length > 1 ? unpaid[0].id : null;
                        setPayGuestId(defaultGuest);
                        setPayMethod(method);
                        setTenderCurrency('USD');
                        const due =
                            defaultGuest == null
                                ? bill.totalCents
                                : unpaid.find((guest) => guest.id === defaultGuest)?.totalCents ??
                                  bill.totalCents;
                        fillPaymentDefaults('USD', due);
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
                    totalCents={paymentTotalCents}
                    payMethod={payMethod}
                    tenderCurrency={tenderCurrency}
                    cashInput={cashInput}
                    cardInput={cardInput}
                    preferredMethod={activeTable.guestPreferredPayment}
                    guests={bill.guestBreakdown.map((guest) => ({
                        id: guest.id,
                        name: guest.name,
                        totalCents: guest.totalCents,
                        paidAt: guest.paidAt,
                    }))}
                    selectedGuestId={payGuestId}
                    onSelectGuest={(guestId) => {
                        setPayGuestId(guestId);
                        const due =
                            guestId == null
                                ? bill.totalCents
                                : bill.guestBreakdown.find((guest) => guest.id === guestId)
                                      ?.totalCents ?? bill.totalCents;
                        fillPaymentDefaults(tenderCurrency, due);
                    }}
                    onMethod={setPayMethod}
                    onCurrency={(currency) => {
                        setTenderCurrency(currency);
                        fillPaymentDefaults(currency, paymentTotalCents);
                    }}
                    onCashInput={setCashInput}
                    onCardInput={setCardInput}
                    onComplete={completePayment}
                    onCancel={cancelPayment}
                />
            )}

            {voidPending && (
                <VoidReasonModal
                    title={voidPending.title}
                    details={voidPending.details}
                    mode={voidPending.mode}
                    onConfirm={confirmVoid}
                    onCancel={() => setVoidPending(null)}
                />
            )}

            {mustChangePin && posSession && (
                <ChangePinModal
                    staffName={posSession.staff.name}
                    error={changePinError}
                    busy={changePinBusy}
                    onSubmit={submitChangePin}
                />
            )}

            {(showPinGate || idleLocked) && !mustChangePin && (
                <PinGate
                    pinInput={pinInput}
                    pinError={pinError}
                    lockMode={idleLocked && !showPinGate}
                    title={idleLocked && !showPinGate ? 'Station locked' : 'Enter PIN'}
                    eyebrow={idleLocked && !showPinGate ? 'Idle timeout' : 'Staff access'}
                    submitLabel={idleLocked && !showPinGate ? 'Unlock' : 'Sign in'}
                    helpText={
                        idleLocked && !showPinGate
                            ? `Enter a staff PIN to unlock this station for ${staff.name}.`
                            : serverMode
                              ? 'Enter your staff PIN to sign in to the POS server.'
                              : 'Enter your staff PIN to switch users or authorize a manager action.'
                    }
                    demoCredentials={
                        hideDemoCredentials
                            ? undefined
                            : serverMode
                              ? 'Server mode: PINs are hashed on the API. Demo seeds: server 1234 · kitchen 2222 · admin 5555 · manager 9999 — change these before go-live.'
                              : roleHelpText(state.staff)
                    }
                    onPinInput={setPinInput}
                    onSubmit={submitPin}
                    onClose={() => {
                        if (idleLocked) return;
                        if (serverMode && !posSession) return;
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
                    onTemplateChange={(template) => {
                        setReceiptTemplate(template);
                        setReceipt(
                            buildSnapshot(
                                activeTable,
                                state.menu,
                                state.restaurant,
                                staff.name,
                                template,
                            ),
                        );
                    }}
                    onClose={() => {
                        setReceipt(null);
                        setShareFeedback(null);
                        if (window.location.hash.startsWith('#bill=')) {
                            history.replaceState(
                                null,
                                '',
                                `${window.location.pathname}${window.location.search}`,
                            );
                        }
                    }}
                />
            )}
        </div>
    );
}
