import { DEFAULT_RESTAURANT } from './defaults';
import type {
    BillSnapshot,
    MenuItem,
    OrderLine,
    PaymentMethod,
    PaymentTender,
    RestaurantProfile,
    SaleRecord,
    TableOrder,
    TipPreset,
} from './types';

/** Official display rate: 1.80 XCG = 1 USD */
export const XCG_PER_USD = 1.8;

export const moneyUsd = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/** @deprecated Prefer moneyUsd / formatDual — kept for transitional imports */
export const money = moneyUsd;

export function usdCentsToXcgCents(usdCents: number): number {
    return Math.round((usdCents * 180) / 100);
}

export function xcgCentsToUsdCents(xcgCents: number): number {
    return Math.round((xcgCents * 100) / 180);
}

export const moneyXcg = (usdCents: number) => {
    const xcgCents = usdCentsToXcgCents(usdCents);
    return `XCG ${(xcgCents / 100).toFixed(2)}`;
};

export function formatDual(usdCents: number): string {
    return `${moneyUsd(usdCents)} · ${moneyXcg(usdCents)}`;
}

export function tipPercentOf(table: Pick<TableOrder, 'tipPreset' | 'tipCustomPercent'>): number {
    return table.tipPreset === 'custom' ? Math.max(0, table.tipCustomPercent) : table.tipPreset;
}

export function percentOfCents(amountCents: number, percent: number): number {
    return Math.round((amountCents * percent) / 100);
}

export function unitPriceCents(item: MenuItem, line: Pick<OrderLine, 'modifiers'>): number {
    const modifierTotal = line.modifiers.reduce((sum, mod) => sum + mod.priceDeltaCents, 0);
    return item.priceCents + modifierTotal;
}

export function lineTotalCents(item: MenuItem, line: OrderLine): number {
    return unitPriceCents(item, line) * line.quantity;
}

export function lineSubtotalCents(lines: OrderLine[], menuById: Map<string, MenuItem>): number {
    return lines.reduce((total, line) => {
        const item = menuById.get(line.menuItemId);
        if (!item) return total;
        return total + lineTotalCents(item, line);
    }, 0);
}

export type BillResult = {
    subtotalCents: number;
    taxCents: number;
    tipCents: number;
    totalCents: number;
    tipPercent: number;
    guestBreakdown: BillSnapshot['guests'];
    items: BillSnapshot['items'];
};

export function computeBill(table: TableOrder, menu: MenuItem[]): BillResult {
    const menuById = new Map(menu.map((item) => [item.id, item]));
    const tipPercent = tipPercentOf(table);
    const items = table.lines
        .map((line) => {
            const item = menuById.get(line.menuItemId);
            if (!item) return null;
            const guest = table.guests.find((entry) => entry.id === line.guestId);
            const unit = unitPriceCents(item, line);
            return {
                name: item.name,
                quantity: line.quantity,
                unitPriceCents: unit,
                lineTotalCents: unit * line.quantity,
                guestName: guest?.name ?? null,
                note: line.note,
                modifiers: line.modifiers.map((mod) => mod.name),
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const subtotalCents = items.reduce((total, item) => total + item.lineTotalCents, 0);
    const taxCents = table.taxEnabled ? percentOfCents(subtotalCents, table.taxPercent) : 0;
    const tipBase = subtotalCents + taxCents;
    const tipCents = percentOfCents(tipBase, tipPercent);
    const totalCents = subtotalCents + taxCents + tipCents;

    const guestBreakdown = table.guests.map((guest) => {
        const guestLines = table.lines.filter((line) => line.guestId === guest.id);
        const guestSubtotal = lineSubtotalCents(guestLines, menuById);
        const share = subtotalCents === 0 ? 0 : guestSubtotal / subtotalCents;
        const guestTax = Math.round(taxCents * share);
        const guestTip = Math.round(tipCents * share);
        return {
            name: guest.name,
            subtotalCents: guestSubtotal,
            taxCents: guestTax,
            tipCents: guestTip,
            totalCents: guestSubtotal + guestTax + guestTip,
        };
    });

    const guestsWithSpend = guestBreakdown.filter((guest) => guest.subtotalCents > 0);
    if (guestsWithSpend.length > 0) {
        const allocatedTax = guestBreakdown.reduce((sum, guest) => sum + guest.taxCents, 0);
        const allocatedTip = guestBreakdown.reduce((sum, guest) => sum + guest.tipCents, 0);
        const last = guestsWithSpend[guestsWithSpend.length - 1];
        last.taxCents += taxCents - allocatedTax;
        last.tipCents += tipCents - allocatedTip;
        last.totalCents = last.subtotalCents + last.taxCents + last.tipCents;
    }

    return { subtotalCents, taxCents, tipCents, totalCents, tipPercent, guestBreakdown, items };
}

export function buildSnapshot(
    table: TableOrder,
    menu: MenuItem[],
    restaurant: RestaurantProfile = DEFAULT_RESTAURANT,
    serverName = 'Server',
): BillSnapshot {
    const bill = computeBill(table, menu);
    return {
        restaurant,
        tableLabel: table.label,
        generatedAt: table.billGeneratedAt ?? new Date().toISOString(),
        status: table.status,
        serverName,
        items: bill.items,
        guests: bill.guestBreakdown,
        subtotalCents: bill.subtotalCents,
        taxEnabled: table.taxEnabled,
        taxPercent: table.taxPercent,
        taxCents: bill.taxCents,
        tipPercent: bill.tipPercent,
        tipCents: bill.tipCents,
        totalCents: bill.totalCents,
        payment: table.payment,
    };
}

export function encodeSnapshot(snapshot: BillSnapshot): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(snapshot))));
}

export function decodeSnapshot(encoded: string): BillSnapshot | null {
    try {
        return JSON.parse(decodeURIComponent(escape(atob(encoded)))) as BillSnapshot;
    } catch {
        return null;
    }
}

export function tipLabel(preset: TipPreset, customPercent: number): string {
    return preset === 'custom' ? `${customPercent}%` : `${preset}%`;
}

export function computePayment(
    totalCents: number,
    method: PaymentMethod,
    cashCents: number,
    cardCents: number,
): PaymentTender {
    const paidAt = new Date().toISOString();
    if (method === 'card') {
        return { method, cashCents: 0, cardCents: totalCents, changeDueCents: 0, paidAt };
    }
    if (method === 'cash') {
        const tendered = Math.max(cashCents, totalCents);
        return {
            method,
            cashCents: tendered,
            cardCents: 0,
            changeDueCents: Math.max(0, tendered - totalCents),
            paidAt,
        };
    }
    const card = Math.max(0, Math.min(cardCents, totalCents));
    const remaining = totalCents - card;
    const cash = Math.max(cashCents, remaining);
    return {
        method,
        cashCents: cash,
        cardCents: card,
        changeDueCents: Math.max(0, cash - remaining),
        paidAt,
    };
}

export function salesForDay(sales: SaleRecord[], day = new Date()): SaleRecord[] {
    const key = day.toISOString().slice(0, 10);
    return sales.filter((sale) => sale.paidAt.slice(0, 10) === key);
}

export function summarizeSales(sales: SaleRecord[]) {
    return sales.reduce(
        (acc, sale) => {
            acc.count += 1;
            acc.subtotalCents += sale.subtotalCents;
            acc.taxCents += sale.taxCents;
            acc.tipCents += sale.tipCents;
            acc.totalCents += sale.totalCents;
            acc.cashCents += sale.payment.cashCents - sale.payment.changeDueCents;
            acc.cardCents += sale.payment.cardCents;
            acc.itemCount += sale.itemCount;
            return acc;
        },
        {
            count: 0,
            subtotalCents: 0,
            taxCents: 0,
            tipCents: 0,
            totalCents: 0,
            cashCents: 0,
            cardCents: 0,
            itemCount: 0,
        },
    );
}

export function salesToCsv(sales: SaleRecord[]): string {
    const header = [
        'paid_at',
        'table',
        'server',
        'items',
        'subtotal',
        'tax',
        'tip',
        'total',
        'method',
        'cash',
        'card',
        'change',
    ];
    const rows = sales.map((sale) =>
        [
            sale.paidAt,
            sale.tableLabel,
            sale.serverName,
            sale.itemCount,
            (sale.subtotalCents / 100).toFixed(2),
            (sale.taxCents / 100).toFixed(2),
            (sale.tipCents / 100).toFixed(2),
            (sale.totalCents / 100).toFixed(2),
            sale.payment.method,
            (sale.payment.cashCents / 100).toFixed(2),
            (sale.payment.cardCents / 100).toFixed(2),
            (sale.payment.changeDueCents / 100).toFixed(2),
        ].join(','),
    );
    return [header.join(','), ...rows].join('\n');
}
