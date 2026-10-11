import { useMemo, useState } from 'react';
import { Icon } from './Icons';
import Price from './Price';
import { ROLE_LABELS } from './roles';
import {
    OVERSIGHT_BUCKET_LABELS,
    OVERSIGHT_BUCKETS,
    buildSaleReceiptSnapshot,
    collectOversightTickets,
    countBuckets,
    enrichSalesForOversight,
    filterOversightSales,
    filterOversightTickets,
    oversightStaffOptions,
    type OversightBucket,
} from './staffOversight';
import { statusLabel } from './statusUi';
import type {
    BillSnapshot,
    KitchenStatus,
    MenuItem,
    RestaurantProfile,
    SaleRecord,
    StaffUser,
    TableOrder,
} from './types';

type Props = {
    tables: TableOrder[];
    menu: MenuItem[];
    staff: StaffUser[];
    sales: SaleRecord[];
    restaurant: RestaurantProfile;
    canManage: boolean;
    onOpenTable: (tableId: string) => void;
    onAdvanceStatus: (tableId: string, lineId: string, status: KitchenStatus) => void;
    onBump: (tableId: string, lineId: string) => void;
    onVoidTicket: (tableId: string, lineId: string) => void;
    onViewTableReceipt: (tableId: string) => void;
    onViewSaleReceipt: (snapshot: BillSnapshot) => void;
    onVoidSale: (saleId: string) => void;
};

const NEXT_STATUS: Partial<Record<KitchenStatus, KitchenStatus>> = {
    draft: 'queued',
    queued: 'preparing',
    preparing: 'ready',
    ready: 'served',
};

export default function StaffOversight({
    tables,
    menu,
    staff,
    sales,
    restaurant,
    canManage,
    onOpenTable,
    onAdvanceStatus,
    onBump,
    onVoidTicket,
    onViewTableReceipt,
    onViewSaleReceipt,
    onVoidSale,
}: Props) {
    const [staffFilter, setStaffFilter] = useState<string | 'all'>('all');
    const [bucket, setBucket] = useState<OversightBucket | 'all'>('all');

    const staffOptions = useMemo(() => oversightStaffOptions(staff), [staff]);
    const allTickets = useMemo(
        () => collectOversightTickets(tables, menu, staff),
        [tables, menu, staff],
    );
    const scopedTickets = useMemo(
        () => filterOversightTickets(allTickets, { staffId: staffFilter, bucket: 'all' }),
        [allTickets, staffFilter],
    );
    const bucketCounts = useMemo(() => countBuckets(scopedTickets), [scopedTickets]);
    const tickets = useMemo(
        () => filterOversightTickets(scopedTickets, { staffId: 'all', bucket }),
        [scopedTickets, bucket],
    );
    const allSales = useMemo(() => enrichSalesForOversight(sales, staff), [sales, staff]);
    const visibleSales = useMemo(
        () => filterOversightSales(allSales, staffFilter),
        [allSales, staffFilter],
    );

    const selectedStaff =
        staffFilter === 'all' ? null : staff.find((entry) => entry.id === staffFilter);

    return (
        <section className="menu-panel oversight-panel">
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">Manager desk</p>
                    <h1>Staff tickets & payments</h1>
                    <p className="fx-note">
                        View every server’s open, pending, preparing, and completed tickets — plus
                        full payment / receipt control.
                    </p>
                </div>
            </div>

            <div className="oversight-staff-tabs" role="tablist" aria-label="Staff filter">
                <button
                    type="button"
                    role="tab"
                    aria-selected={staffFilter === 'all'}
                    className={staffFilter === 'all' ? 'active' : ''}
                    onClick={() => setStaffFilter('all')}
                >
                    All staff
                    <small>{allTickets.length}</small>
                </button>
                {staffOptions.map((entry) => {
                    const count = allTickets.filter((ticket) => ticket.staffId === entry.id).length;
                    return (
                        <button
                            key={entry.id}
                            type="button"
                            role="tab"
                            aria-selected={staffFilter === entry.id}
                            className={staffFilter === entry.id ? 'active' : ''}
                            onClick={() => setStaffFilter(entry.id)}
                        >
                            {entry.name}
                            <small>
                                {ROLE_LABELS[entry.role]} · {count}
                            </small>
                        </button>
                    );
                })}
            </div>

            {selectedStaff && (
                <p className="oversight-selected">
                    Showing <strong>{selectedStaff.name}</strong> ({ROLE_LABELS[selectedStaff.role]})
                </p>
            )}

            <div className="oversight-bucket-tabs" role="tablist" aria-label="Ticket status">
                <button
                    type="button"
                    className={bucket === 'all' ? 'active' : ''}
                    onClick={() => setBucket('all')}
                >
                    All <span>{bucketCounts.all}</span>
                </button>
                {OVERSIGHT_BUCKETS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        className={`bucket-${key} ${bucket === key ? 'active' : ''}`}
                        onClick={() => setBucket(key)}
                    >
                        {OVERSIGHT_BUCKET_LABELS[key]} <span>{bucketCounts[key]}</span>
                    </button>
                ))}
            </div>

            <div className="oversight-ticket-list">
                {tickets.length === 0 && (
                    <p className="empty-menu">No tickets in this filter.</p>
                )}
                {tickets.map((ticket) => {
                    const next = NEXT_STATUS[ticket.kitchenStatus];
                    return (
                        <article key={ticket.id} className={`oversight-ticket bucket-${ticket.bucket}`}>
                            <div className="oversight-ticket-main">
                                <p className="eyebrow">
                                    {OVERSIGHT_BUCKET_LABELS[ticket.bucket]} ·{' '}
                                    {statusLabel(ticket.kitchenStatus)}
                                </p>
                                <h2>
                                    {ticket.quantity}× {ticket.itemName}
                                </h2>
                                <p>
                                    {ticket.tableLabel}
                                    {ticket.orderNumber ? ` · ${ticket.orderNumber}` : ''}
                                    {' · '}
                                    {ticket.staffName}
                                    {ticket.checkKind === 'bar_tab' ? ' · Bar tab' : ''}
                                </p>
                                {(ticket.modifiers.length > 0 || ticket.note) && (
                                    <p className="description">
                                        {[...ticket.modifiers, ticket.note].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                            </div>
                            <div className="oversight-ticket-actions">
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => onOpenTable(ticket.tableId)}
                                >
                                    <Icon name="users" /> Open check
                                </button>
                                <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={() => onViewTableReceipt(ticket.tableId)}
                                >
                                    <Icon name="receipt" /> Receipt
                                </button>
                                {canManage && ticket.kitchenStatus !== 'draft' && (
                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => onBump(ticket.tableId, ticket.lineId)}
                                    >
                                        Bump
                                    </button>
                                )}
                                {canManage && next && (
                                    <button
                                        type="button"
                                        className="generate-button"
                                        onClick={() =>
                                            onAdvanceStatus(ticket.tableId, ticket.lineId, next)
                                        }
                                    >
                                        Mark {statusLabel(next)}
                                    </button>
                                )}
                                {canManage && (
                                    <button
                                        type="button"
                                        className="ghost-text danger-text"
                                        onClick={() => onVoidTicket(ticket.tableId, ticket.lineId)}
                                    >
                                        Void ticket
                                    </button>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>

            <div className="oversight-payments">
                <div className="menu-heading">
                    <div>
                        <p className="eyebrow">Payments</p>
                        <h2>Receipts & voids</h2>
                    </div>
                </div>
                <div className="sales-table oversight-sales">
                    <div className="sales-row head with-actions">
                        <span>Time</span>
                        <span>Table</span>
                        <span>Server</span>
                        <span>Method</span>
                        <span>Total</span>
                        <span>Actions</span>
                    </div>
                    {visibleSales.length === 0 && (
                        <p className="empty-menu">No payments for this staff filter.</p>
                    )}
                    {visibleSales.map((sale) => (
                        <div className="sales-row with-actions" key={sale.id}>
                            <span>{new Date(sale.paidAt).toLocaleString()}</span>
                            <span>
                                {sale.tableLabel}
                                {sale.guestName ? ` · ${sale.guestName}` : ''}
                                {sale.orderNumbers?.length
                                    ? ` · ${sale.orderNumbers.join(', ')}`
                                    : ''}
                            </span>
                            <span>{sale.serverName}</span>
                            <span>{sale.payment.method}</span>
                            <span>
                                <Price cents={sale.totalCents} compact />
                            </span>
                            <span className="oversight-sale-actions">
                                <button
                                    type="button"
                                    className="ghost-text"
                                    onClick={() =>
                                        onViewSaleReceipt(
                                            buildSaleReceiptSnapshot(sale, restaurant),
                                        )
                                    }
                                >
                                    View receipt
                                </button>
                                {canManage && (
                                    <button
                                        type="button"
                                        className="ghost-text danger-text"
                                        onClick={() => onVoidSale(sale.id)}
                                    >
                                        Void payment
                                    </button>
                                )}
                                {tables.some((table) => table.id === sale.tableId) && (
                                    <button
                                        type="button"
                                        className="ghost-text"
                                        onClick={() => onOpenTable(sale.tableId)}
                                    >
                                        Open check
                                    </button>
                                )}
                            </span>
                        </div>
                    ))}
                </div>
                {!canManage && (
                    <p className="pin-help">Sign in as Manager or Admin to void tickets and payments.</p>
                )}
            </div>
        </section>
    );
}
