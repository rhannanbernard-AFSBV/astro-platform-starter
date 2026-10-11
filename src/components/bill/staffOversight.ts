import { DEFAULT_RESTAURANT } from './defaults';
import type {
    BillSnapshot,
    KitchenStatus,
    MenuItem,
    PersistedState,
    SaleRecord,
    StaffUser,
    TableOrder,
} from './types';

/** Manager/admin desk buckets — maps kitchen + check lifecycle to floor language. */
export const OVERSIGHT_BUCKETS = ['open', 'pending', 'preparing', 'completed'] as const;
export type OversightBucket = (typeof OVERSIGHT_BUCKETS)[number];

export const OVERSIGHT_BUCKET_LABELS: Record<OversightBucket, string> = {
    open: 'Open',
    pending: 'Pending',
    preparing: 'Preparing',
    completed: 'Completed',
};

export type OversightTicket = {
    id: string;
    tableId: string;
    tableLabel: string;
    lineId: string;
    staffId: string | null;
    staffName: string;
    orderNumber: string | null;
    itemName: string;
    quantity: number;
    kitchenStatus: KitchenStatus;
    bucket: OversightBucket;
    checkStatus: TableOrder['status'];
    checkKind: TableOrder['checkKind'];
    sentAt: string | null;
    note: string;
    modifiers: string[];
};

export type OversightSale = SaleRecord & {
    staffId: string | null;
};

function staffNameById(staff: StaffUser[], id: string | null | undefined): string {
    if (!id) return 'Unassigned';
    return staff.find((entry) => entry.id === id)?.name ?? 'Unassigned';
}

function resolveLineStaffId(table: TableOrder, line: TableOrder['lines'][number]): string | null {
    if (line.sentByStaffId) return line.sentByStaffId;
    const sibling = table.lines.find((entry) => entry.sentByStaffId);
    return sibling?.sentByStaffId ?? null;
}

export function bucketForKitchenStatus(
    status: KitchenStatus,
    tableStatus: TableOrder['status'],
): OversightBucket {
    if (tableStatus === 'paid' || status === 'served' || status === 'ready') return 'completed';
    if (status === 'preparing') return 'preparing';
    if (status === 'queued') return 'pending';
    return 'open';
}

export function collectOversightTickets(
    tables: TableOrder[],
    menu: MenuItem[],
    staff: StaffUser[],
): OversightTicket[] {
    const menuById = new Map(menu.map((item) => [item.id, item]));
    const tickets: OversightTicket[] = [];

    for (const table of tables) {
        for (const line of table.lines) {
            const item = menuById.get(line.menuItemId);
            const staffId = resolveLineStaffId(table, line);
            const bucket = bucketForKitchenStatus(line.kitchenStatus, table.status);
            tickets.push({
                id: `${table.id}:${line.id}`,
                tableId: table.id,
                tableLabel: table.label,
                lineId: line.id,
                staffId,
                staffName: staffNameById(staff, staffId),
                orderNumber: line.orderNumber,
                itemName: item?.name ?? 'Item',
                quantity: line.quantity,
                kitchenStatus: line.kitchenStatus,
                bucket,
                checkStatus: table.status,
                checkKind: table.checkKind ?? 'table',
                sentAt: line.sentToKitchenAt,
                note: line.note,
                modifiers: line.modifiers.map((mod) => mod.name),
            });
        }
    }

    return tickets.sort((a, b) => {
        const aTime = a.sentAt ?? '';
        const bTime = b.sentAt ?? '';
        return bTime.localeCompare(aTime);
    });
}

export function enrichSalesForOversight(
    sales: SaleRecord[],
    staff: StaffUser[],
): OversightSale[] {
    return sales.map((sale) => {
        const byId =
            typeof sale.serverStaffId === 'string'
                ? staff.find((entry) => entry.id === sale.serverStaffId)
                : undefined;
        const byName = staff.find(
            (entry) => entry.name.toLowerCase() === sale.serverName.toLowerCase(),
        );
        return {
            ...sale,
            staffId: byId?.id ?? byName?.id ?? sale.serverStaffId ?? null,
        };
    });
}

export function filterOversightTickets(
    tickets: OversightTicket[],
    options: { staffId: string | 'all'; bucket: OversightBucket | 'all' },
): OversightTicket[] {
    return tickets.filter((ticket) => {
        if (options.staffId !== 'all' && ticket.staffId !== options.staffId) return false;
        if (options.bucket !== 'all' && ticket.bucket !== options.bucket) return false;
        return true;
    });
}

export function filterOversightSales(
    sales: OversightSale[],
    staffId: string | 'all',
): OversightSale[] {
    if (staffId === 'all') return sales;
    return sales.filter((sale) => sale.staffId === staffId);
}

export function countBuckets(tickets: OversightTicket[]): Record<OversightBucket | 'all', number> {
    const counts: Record<OversightBucket | 'all', number> = {
        all: tickets.length,
        open: 0,
        pending: 0,
        preparing: 0,
        completed: 0,
    };
    for (const ticket of tickets) {
        counts[ticket.bucket] += 1;
    }
    return counts;
}

/** Floor staff shown in the oversight picker (anyone who can own tickets). */
export function oversightStaffOptions(staff: StaffUser[]): StaffUser[] {
    return staff
        .filter((entry) =>
            ['server', 'bartender', 'manager', 'admin'].includes(entry.role),
        )
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildSaleReceiptSnapshot(
    sale: SaleRecord,
    restaurant = DEFAULT_RESTAURANT,
): BillSnapshot {
    return {
        restaurant,
        tableLabel: sale.tableLabel,
        generatedAt: sale.paidAt,
        status: 'paid',
        serverName: sale.serverName,
        orderNumbers: sale.orderNumbers ?? [],
        template: 'paid',
        items: [
            {
                name: sale.guestName
                    ? `Paid check · ${sale.guestName}`
                    : 'Paid check',
                quantity: Math.max(1, sale.itemCount),
                unitPriceCents: sale.subtotalCents,
                lineTotalCents: sale.subtotalCents,
                guestName: sale.guestName,
                note: sale.orderNumbers?.length
                    ? sale.orderNumbers.join(', ')
                    : '',
                modifiers: [],
                orderNumber: sale.orderNumbers?.[0] ?? null,
                kitchenStatus: 'served',
            },
        ],
        guests: sale.guestId
            ? [
                  {
                      id: sale.guestId,
                      name: sale.guestName ?? 'Guest',
                      subtotalCents: sale.subtotalCents,
                      serviceChargeCents: sale.serviceChargeCents,
                      tipCents: sale.tipCents,
                      totalCents: sale.totalCents,
                      paidAt: sale.paidAt,
                  },
              ]
            : [],
        subtotalCents: sale.subtotalCents,
        serviceChargeEnabled: sale.serviceChargeCents > 0,
        serviceChargePercent: 0,
        serviceChargeCents: sale.serviceChargeCents,
        tipCents: sale.tipCents,
        totalCents: sale.totalCents,
        payment: sale.payment,
        guestSignatureDataUrl: null,
        guestPreferredPayment: sale.payment.method,
    };
}

export function staffDeskSummary(state: Pick<PersistedState, 'tables' | 'menu' | 'staff' | 'sales'>) {
    const tickets = collectOversightTickets(state.tables, state.menu, state.staff);
    const sales = enrichSalesForOversight(state.sales, state.staff);
    return { tickets, sales, buckets: countBuckets(tickets) };
}
