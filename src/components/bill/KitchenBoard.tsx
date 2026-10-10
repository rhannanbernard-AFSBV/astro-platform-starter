import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icons';
import { isTicketLate, ticketWaitMinutes } from './posLogic';
import StatusTabs, { StatusChip } from './StatusTabs';
import {
    isBeverageItem,
    isKitchenBoundItem,
    type ActiveKitchenStatus,
} from './statusUi';
import {
    COURSE_FIRE_LABELS,
    COURSE_FIRE_OPTIONS,
    type CourseFire,
    type KitchenStatus,
    type MenuItem,
    type TableOrder,
} from './types';

type Ticket = {
    table: TableOrder;
    line: TableOrder['lines'][number];
    item: MenuItem;
};

type BoardKind = 'kitchen' | 'bar';

type Props = {
    tables: TableOrder[];
    menuById: Map<string, MenuItem>;
    bumpAfterMinutes: number;
    canDeleteTickets: boolean;
    canEightySix?: boolean;
    /** Kitchen expo (food) or bar rail (drinks). */
    board?: BoardKind;
    onStatus: (tableId: string, lineId: string, status: KitchenStatus) => void;
    onDeleteTicket: (tableId: string, lineId: string) => void;
    onBump: (tableId: string, lineId: string) => void;
    onRecall: (tableId: string, lineId: string) => void;
    onCourseFire: (tableId: string, lineId: string, courseFire: CourseFire) => void;
    onFireAllHeld: (tableId: string) => void;
    onToggleEightySix?: (menuItemId: string) => void;
};

export default function KitchenBoard({
    tables,
    menuById,
    bumpAfterMinutes,
    canDeleteTickets,
    canEightySix = false,
    board = 'kitchen',
    onStatus,
    onDeleteTicket,
    onBump,
    onRecall,
    onCourseFire,
    onFireAllHeld,
    onToggleEightySix,
}: Props) {
    const isBar = board === 'bar';
    const stockItems = useMemo(() => {
        const items = [...menuById.values()].filter((item) =>
            isBar ? isBeverageItem(item) : isKitchenBoundItem(item),
        );
        return items.sort((a, b) => a.name.localeCompare(b.name));
    }, [menuById, isBar]);
    const [statusFilter, setStatusFilter] = useState<ActiveKitchenStatus | 'all'>('all');
    const [courseFilter, setCourseFilter] = useState<CourseFire | 'all'>('all');
    const [activeTableId, setActiveTableId] = useState<string>('');
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    const tableGroups = useMemo(() => {
        return tables
            .map((table) => {
                const tickets = table.lines
                    .filter((line) => {
                        if (line.kitchenStatus === 'draft') return false;
                        const item = menuById.get(line.menuItemId);
                        return isBar ? isBeverageItem(item) : isKitchenBoundItem(item);
                    })
                    .map((line) => {
                        const item = menuById.get(line.menuItemId);
                        return item ? ({ table, line, item } satisfies Ticket) : null;
                    })
                    .filter((entry): entry is Ticket => Boolean(entry));
                return { table, tickets };
            })
            .filter((group) => group.tickets.some((t) => t.line.kitchenStatus !== 'served'));
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
        return activeGroup.tickets.filter((ticket) => {
            if (statusFilter !== 'all' && ticket.line.kitchenStatus !== statusFilter) return false;
            if (courseFilter !== 'all' && ticket.line.courseFire !== courseFilter) return false;
            if (statusFilter === 'all' && ticket.line.kitchenStatus === 'served') return false;
            return true;
        });
    }, [activeGroup, statusFilter, courseFilter]);

    const statusCounts = useMemo(() => {
        const counts: Partial<Record<ActiveKitchenStatus, number>> = {
            queued: 0,
            preparing: 0,
            ready: 0,
            served: 0,
        };
        for (const ticket of activeGroup?.tickets ?? []) {
            const status = ticket.line.kitchenStatus;
            if (
                status === 'queued' ||
                status === 'preparing' ||
                status === 'ready' ||
                status === 'served'
            ) {
                counts[status] = (counts[status] ?? 0) + 1;
            }
        }
        return counts;
    }, [activeGroup]);

    const heldCount =
        activeGroup?.tickets.filter(
            (t) => t.line.courseFire === 'hold' && t.line.kitchenStatus !== 'served',
        ).length ?? 0;

    const totalActive = tableGroups.reduce(
        (sum, group) =>
            sum + group.tickets.filter((t) => t.line.kitchenStatus !== 'served').length,
        0,
    );

    return (
        <section className={`menu-panel kitchen-panel ${isBar ? 'bar-panel' : ''}`}>
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">{isBar ? 'Bar rail' : 'Expo'}</p>
                    <h1>{isBar ? 'Bar tickets' : 'Kitchen tickets'}</h1>
                </div>
                <div className="kitchen-header-actions">
                    {activeGroup && (
                        <button
                            type="button"
                            className="secondary-button no-print"
                            onClick={() => window.print()}
                        >
                            <Icon name="receipt" /> Print {isBar ? 'bar' : 'kitchen'} ticket
                        </button>
                    )}
                    <p className="ticket-count">{totalActive} active</p>
                </div>
            </div>

            {canEightySix && onToggleEightySix && (
                <div className="eighty-six-rail" aria-label="86 list">
                    <p className="billing-label">86 list — tap to toggle stock</p>
                    <div className="eighty-six-chips">
                        {stockItems.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={`eighty-chip${item.eightySixed ? ' active' : ''}`}
                                onClick={() => onToggleEightySix(item.id)}
                                title={item.eightySixed ? 'Mark back in stock' : '86 this item'}
                            >
                                {item.eightySixed ? '86 · ' : ''}
                                {item.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <StatusTabs
                active={statusFilter}
                counts={statusCounts}
                onSelect={setStatusFilter}
            />

            {!isBar && (
                <div className="course-filter" role="group" aria-label="Course fire">
                    <button
                        type="button"
                        className={courseFilter === 'all' ? 'active' : ''}
                        onClick={() => setCourseFilter('all')}
                    >
                        All courses
                    </button>
                    {COURSE_FIRE_OPTIONS.map((course) => (
                        <button
                            key={course}
                            type="button"
                            className={courseFilter === course ? 'active' : ''}
                            onClick={() => setCourseFilter(course)}
                        >
                            {COURSE_FIRE_LABELS[course]}
                        </button>
                    ))}
                </div>
            )}

            {tableGroups.length === 0 ? (
                <div className="empty-order">
                    <span>
                        <Icon name={isBar ? 'receipt' : 'chef'} />
                    </span>
                    <h3>{isBar ? 'No active bar tickets' : 'No active kitchen tickets'}</h3>
                    <p>
                        {isBar
                            ? 'Drink tickets appear here after Service sends them to the bar.'
                            : 'Food tickets appear here after Service sends them. Drinks go to the Bar rail.'}
                    </p>
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
                                <span>
                                    {
                                        group.tickets.filter((t) => t.line.kitchenStatus !== 'served')
                                            .length
                                    }
                                </span>
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
                                <div className="kitchen-header-actions">
                                    {!isBar && heldCount > 0 && (
                                        <button
                                            type="button"
                                            className="secondary-button"
                                            onClick={() => onFireAllHeld(activeGroup.table.id)}
                                        >
                                            Fire held ({heldCount})
                                        </button>
                                    )}
                                    <p className="ticket-count">
                                        {filteredTickets.length} ticket
                                        {filteredTickets.length === 1 ? '' : 's'}
                                    </p>
                                </div>
                            </header>

                            {filteredTickets.length === 0 ? (
                                <div className="empty-order compact-empty">
                                    <h3>No tickets in this status</h3>
                                    <p>
                                        {isBar
                                            ? 'Choose another status tab or table.'
                                            : 'Choose another color-coded status tab, course, or table.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="ticket-grid">
                                    {filteredTickets.map((ticket) => {
                                        const late = isTicketLate(
                                            ticket.line,
                                            bumpAfterMinutes,
                                            now,
                                        );
                                        const wait = ticketWaitMinutes(ticket.line, now);
                                        return (
                                            <article
                                                key={ticket.line.id}
                                                className={`ticket-card ${ticket.line.kitchenStatus} course-${ticket.line.courseFire}${late ? ' late' : ''}${ticket.line.bumpCount > 0 ? ' bumped' : ''}`}
                                            >
                                                <header>
                                                    <strong>
                                                        {ticket.line.orderNumber ?? 'No order #'}
                                                    </strong>
                                                    <StatusChip status={ticket.line.kitchenStatus} />
                                                </header>
                                                <div className="ticket-meta-row">
                                                    {!isBar && (
                                                        <span
                                                            className={`course-chip course-${ticket.line.courseFire}`}
                                                        >
                                                            {COURSE_FIRE_LABELS[ticket.line.courseFire]}
                                                        </span>
                                                    )}
                                                    {ticket.line.kitchenStatus !== 'served' && (
                                                        <span className={`wait-chip${late ? ' late' : ''}`}>
                                                            {wait}m
                                                            {late ? ' · late' : ''}
                                                        </span>
                                                    )}
                                                    {ticket.line.bumpCount > 0 && (
                                                        <span className="bump-chip">
                                                            Bump ×{ticket.line.bumpCount}
                                                        </span>
                                                    )}
                                                </div>
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
                                                {!isBar && (
                                                    <div className="course-filter compact" role="group">
                                                        {COURSE_FIRE_OPTIONS.map((course) => (
                                                            <button
                                                                key={course}
                                                                type="button"
                                                                className={
                                                                    ticket.line.courseFire === course
                                                                        ? 'active'
                                                                        : ''
                                                                }
                                                                onClick={() =>
                                                                    onCourseFire(
                                                                        ticket.table.id,
                                                                        ticket.line.id,
                                                                        course,
                                                                    )
                                                                }
                                                            >
                                                                {COURSE_FIRE_LABELS[course]}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                <div className="ticket-actions">
                                                    {ticket.line.kitchenStatus === 'queued' &&
                                                        ticket.line.courseFire !== 'hold' && (
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
                                                        ticket.line.kitchenStatus ===
                                                            'preparing') &&
                                                        ticket.line.courseFire !== 'hold' && (
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
                                                    {ticket.line.kitchenStatus === 'served' && (
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                onRecall(
                                                                    ticket.table.id,
                                                                    ticket.line.id,
                                                                )
                                                            }
                                                        >
                                                            Recall
                                                        </button>
                                                    )}
                                                    {(ticket.line.kitchenStatus === 'queued' ||
                                                        ticket.line.kitchenStatus ===
                                                            'preparing') && (
                                                        <button
                                                            type="button"
                                                            className="bump-button"
                                                            onClick={() =>
                                                                onBump(
                                                                    ticket.table.id,
                                                                    ticket.line.id,
                                                                )
                                                            }
                                                        >
                                                            Bump
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
                                                            Void
                                                        </button>
                                                    )}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {activeGroup && (
                <div className="kitchen-print-sheet print-only" aria-hidden="true">
                    <header>
                        <p>{isBar ? 'Bar ticket' : 'Kitchen ticket'}</p>
                        <h2>{activeGroup.table.label}</h2>
                        <p>{new Date().toLocaleString()}</p>
                    </header>
                    <ul>
                        {activeGroup.tickets
                            .filter((ticket) => ticket.line.kitchenStatus !== 'served')
                            .map((ticket) => (
                                <li key={ticket.line.id}>
                                    <strong>
                                        {ticket.line.quantity}× {ticket.item.name}
                                    </strong>
                                    <span>{ticket.line.orderNumber ?? ''}</span>
                                    {!isBar && (
                                        <span>{COURSE_FIRE_LABELS[ticket.line.courseFire]}</span>
                                    )}
                                    {ticket.line.modifiers.length > 0 && (
                                        <em>
                                            {ticket.line.modifiers.map((mod) => mod.name).join(', ')}
                                        </em>
                                    )}
                                    {ticket.line.note && <em>Note: {ticket.line.note}</em>}
                                </li>
                            ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
