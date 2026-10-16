import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icons';
import StatusTabs, { StatusChip } from './StatusTabs';
import {
    isKitchenBoundItem,
    type ActiveKitchenStatus,
} from './statusUi';
import type { KitchenStatus, MenuItem, TableOrder } from './types';

type Ticket = {
    table: TableOrder;
    line: TableOrder['lines'][number];
    item: MenuItem;
};

type Props = {
    tables: TableOrder[];
    menuById: Map<string, MenuItem>;
    canDeleteTickets: boolean;
    onStatus: (tableId: string, lineId: string, status: KitchenStatus) => void;
    onDeleteTicket: (tableId: string, lineId: string) => void;
};

export default function KitchenBoard({
    tables,
    menuById,
    canDeleteTickets,
    onStatus,
    onDeleteTicket,
}: Props) {
    const [statusFilter, setStatusFilter] = useState<ActiveKitchenStatus | 'all'>('all');
    const [activeTableId, setActiveTableId] = useState<string>('');

    const tableGroups = useMemo(() => {
        return tables
            .map((table) => {
                const tickets = table.lines
                    .filter((line) => {
                        if (line.kitchenStatus === 'draft' || line.kitchenStatus === 'served') {
                            return false;
                        }
                        const item = menuById.get(line.menuItemId);
                        return isKitchenBoundItem(item);
                    })
                    .map((line) => {
                        const item = menuById.get(line.menuItemId);
                        return item ? ({ table, line, item } satisfies Ticket) : null;
                    })
                    .filter((entry): entry is Ticket => Boolean(entry));
                return { table, tickets };
            })
            .filter((group) => group.tickets.length > 0);
    }, [tables, menuById]);

    useEffect(() => {
        if (tableGroups.length === 0) {
            setActiveTableId('');
            return;
        }
        if (!tableGroups.some((group) => group.table.id === activeTableId)) {
            setActiveTableId(tableGroups[0].table.id);
        }
    }, [tableGroups, activeTableId]);

    const activeGroup =
        tableGroups.find((group) => group.table.id === activeTableId) ?? tableGroups[0] ?? null;

    const filteredTickets = useMemo(() => {
        if (!activeGroup) return [];
        if (statusFilter === 'all') return activeGroup.tickets;
        return activeGroup.tickets.filter((ticket) => ticket.line.kitchenStatus === statusFilter);
    }, [activeGroup, statusFilter]);

    const statusCounts = useMemo(() => {
        const counts: Partial<Record<ActiveKitchenStatus, number>> = {
            queued: 0,
            preparing: 0,
            ready: 0,
            served: 0,
        };
        for (const ticket of activeGroup?.tickets ?? []) {
            const status = ticket.line.kitchenStatus;
            if (status === 'queued' || status === 'preparing' || status === 'ready') {
                counts[status] = (counts[status] ?? 0) + 1;
            }
        }
        return counts;
    }, [activeGroup]);

    const totalActive = tableGroups.reduce((sum, group) => sum + group.tickets.length, 0);

    return (
        <section className="menu-panel kitchen-panel">
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">Expo</p>
                    <h1>Kitchen tickets</h1>
                </div>
                <p className="ticket-count">{totalActive} active</p>
            </div>

            <StatusTabs
                active={statusFilter}
                counts={statusCounts}
                onSelect={setStatusFilter}
            />

            {tableGroups.length === 0 ? (
                <div className="empty-order">
                    <span>
                        <Icon name="chef" />
                    </span>
                    <h3>No active kitchen tickets</h3>
                    <p>Food tickets appear here after Service sends them. Beverages stay with the server.</p>
                </div>
            ) : (
                <>
                    <div className="kitchen-table-tabs" role="tablist" aria-label="Tables">
                        {tableGroups.map((group) => (
                            <button
                                key={group.table.id}
                                type="button"
                                role="tab"
                                aria-selected={group.table.id === activeGroup?.table.id}
                                className={
                                    group.table.id === activeGroup?.table.id
                                        ? 'kitchen-table-tab active'
                                        : 'kitchen-table-tab'
                                }
                                onClick={() => setActiveTableId(group.table.id)}
                            >
                                <strong>{group.table.label}</strong>
                                <span>{group.tickets.length}</span>
                            </button>
                        ))}
                    </div>

                    {activeGroup && (
                        <div className="kitchen-table-section">
                            <header className="kitchen-table-header">
                                <div>
                                    <p className="eyebrow">Table</p>
                                    <h2>{activeGroup.table.label}</h2>
                                </div>
                                <p className="ticket-count">
                                    {filteredTickets.length} ticket
                                    {filteredTickets.length === 1 ? '' : 's'}
                                </p>
                            </header>

                            {filteredTickets.length === 0 ? (
                                <div className="empty-order compact-empty">
                                    <h3>No tickets in this status</h3>
                                    <p>Choose another color-coded status tab or table.</p>
                                </div>
                            ) : (
                                <div className="ticket-grid">
                                    {filteredTickets.map((ticket) => (
                                        <article
                                            key={ticket.line.id}
                                            className={`ticket-card ${ticket.line.kitchenStatus}`}
                                        >
                                            <header>
                                                <strong>
                                                    {ticket.line.orderNumber ?? 'No order #'}
                                                </strong>
                                                <StatusChip status={ticket.line.kitchenStatus} />
                                            </header>
                                            <h3>
                                                {ticket.line.quantity}× {ticket.item.name}
                                            </h3>
                                            {ticket.line.modifiers.length > 0 && (
                                                <p>
                                                    {ticket.line.modifiers
                                                        .map((mod) => mod.name)
                                                        .join(' · ')}
                                                </p>
                                            )}
                                            {ticket.line.note && (
                                                <p className="ticket-note">
                                                    Note: {ticket.line.note}
                                                </p>
                                            )}
                                            <div className="ticket-actions">
                                                {ticket.line.kitchenStatus === 'queued' && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onStatus(
                                                                ticket.table.id,
                                                                ticket.line.id,
                                                                'preparing',
                                                            )
                                                        }
                                                    >
                                                        Start
                                                    </button>
                                                )}
                                                {(ticket.line.kitchenStatus === 'queued' ||
                                                    ticket.line.kitchenStatus === 'preparing') && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onStatus(
                                                                ticket.table.id,
                                                                ticket.line.id,
                                                                'ready',
                                                            )
                                                        }
                                                    >
                                                        Ready
                                                    </button>
                                                )}
                                                {ticket.line.kitchenStatus === 'ready' && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            onStatus(
                                                                ticket.table.id,
                                                                ticket.line.id,
                                                                'served',
                                                            )
                                                        }
                                                    >
                                                        Served
                                                    </button>
                                                )}
                                                {canDeleteTickets && (
                                                    <button
                                                        type="button"
                                                        className="danger-ticket"
                                                        onClick={() =>
                                                            onDeleteTicket(
                                                                ticket.table.id,
                                                                ticket.line.id,
                                                            )
                                                        }
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
