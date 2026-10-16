import { useMemo } from 'react';
import { Icon } from './Icons';
import VirtualList from './VirtualList';
import type { KitchenStatus, MenuItem, TableOrder } from './types';

type Ticket = {
    table: TableOrder;
    line: TableOrder['lines'][number];
    item: MenuItem;
};

type Props = {
    tables: TableOrder[];
    menuById: Map<string, MenuItem>;
    onStatus: (tableId: string, lineId: string, status: KitchenStatus) => void;
};

export default function KitchenBoard({ tables, menuById, onStatus }: Props) {
    const tickets = useMemo<Ticket[]>(() => {
        return tables.flatMap((table) =>
            table.lines
                .filter((line) => line.kitchenStatus !== 'draft' && line.kitchenStatus !== 'served')
                .map((line) => {
                    const item = menuById.get(line.menuItemId);
                    return item ? { table, line, item } : null;
                })
                .filter((entry): entry is Ticket => Boolean(entry)),
        );
    }, [tables, menuById]);

    return (
        <section className="menu-panel kitchen-panel">
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">Expo</p>
                    <h1>Kitchen tickets</h1>
                </div>
                <p className="ticket-count">{tickets.length} active</p>
            </div>
            {tickets.length === 0 ? (
                <div className="empty-order">
                    <span>
                        <Icon name="chef" />
                    </span>
                    <h3>No active tickets</h3>
                    <p>Send draft items from Service to start the board.</p>
                </div>
            ) : (
                <VirtualList
                    className="ticket-virtual"
                    items={tickets}
                    itemHeight={190}
                    height={620}
                    getKey={(ticket) => ticket.line.id}
                    renderItem={(ticket) => (
                        <article className={`ticket-card ${ticket.line.kitchenStatus}`}>
                            <header>
                                <strong>{ticket.table.label}</strong>
                                <span>{ticket.line.kitchenStatus}</span>
                            </header>
                            <h3>
                                {ticket.line.quantity}× {ticket.item.name}
                            </h3>
                            {ticket.line.modifiers.length > 0 && (
                                <p>{ticket.line.modifiers.map((mod) => mod.name).join(' · ')}</p>
                            )}
                            {ticket.line.note && (
                                <p className="ticket-note">Note: {ticket.line.note}</p>
                            )}
                            <div className="ticket-actions">
                                {ticket.line.kitchenStatus === 'queued' && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onStatus(ticket.table.id, ticket.line.id, 'preparing')
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
                                            onStatus(ticket.table.id, ticket.line.id, 'ready')
                                        }
                                    >
                                        Ready
                                    </button>
                                )}
                                {ticket.line.kitchenStatus === 'ready' && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onStatus(ticket.table.id, ticket.line.id, 'served')
                                        }
                                    >
                                        Served
                                    </button>
                                )}
                            </div>
                        </article>
                    )}
                />
            )}
        </section>
    );
}
