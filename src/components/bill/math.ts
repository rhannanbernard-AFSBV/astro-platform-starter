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
    TipAmountPreset,
} from './types';

/** Default display rate: 1.80 XCG = 1 USD (override via settings / setActiveXcgRate) */
export const XCG_PER_USD = 1.8;

let activeXcgPerUsd = XCG_PER_USD;

export function setActiveXcgRate(rate: number) {
    const next = Number(rate);
    activeXcgPerUsd = Number.isFinite(next) && next > 0 ? next : XCG_PER_USD;
}

export function getActiveXcgRate() {
    return activeXcgPerUsd;
}

export const moneyUsd = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/** @deprecated Prefer moneyUsd / formatDual — kept for transitional imports */
export const money = moneyUsd;

export function usdCentsToXcgCents(usdCents: number, rate = activeXcgPerUsd): number {
    return Math.round(usdCents * rate);
}

export function xcgCentsToUsdCents(xcgCents: number, rate = activeXcgPerUsd): number {
    return Math.round(xcgCents / rate);
}

export const moneyXcg = (usdCents: number, rate = activeXcgPerUsd) => {
    const xcgCents = usdCentsToXcgCents(usdCents, rate);
    return `XCG ${(xcgCents / 100).toFixed(2)}`;
};

export function formatDual(usdCents: number, rate = activeXcgPerUsd): string {
    return `${moneyUsd(usdCents)} · ${moneyXcg(usdCents, rate)}`;
}

export function percentOfCents(amountCents: number, percent: number): number {
    return Math.round((amountCents * percent) / 100);
}

export function tipCentsOf(table: Pick<TableOrder, 'tipAmountPreset' | 'tipCents'>): number {
    if (table.tipAmountPreset === 'custom') return Math.max(0, Math.round(table.tipCents));
    return Math.max(0, table.tipAmountPreset);
}

export function tipAmountLabel(preset: TipAmountPreset, tipCents: number): string {
    if (preset === 'custom') return moneyUsd(Math.max(0, tipCents));
    return moneyUsd(preset);
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

export function formatOrderNumber(seq: number): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `ORD-${day}-${String(seq).padStart(4, '0')}`;
}

export function collectOrderNumbers(lines: OrderLine[]): string[] {
    const seen = new Set<string>();
    const numbers: string[] = [];
    for (const line of lines) {
        if (line.orderNumber && !seen.has(line.orderNumber)) {
            seen.add(line.orderNumber);
            numbers.push(line.orderNumber);
        }
    }
    return numbers;
}

export type BillResult = {
    subtotalCents: number;
    serviceChargeCents: number;
    tipCents: number;
    totalCents: number;
    guestBreakdown: BillSnapshot['guests'];
    items: BillSnapshot['items'];
};

export function computeBill(table: TableOrder, menu: MenuItem[]): BillResult {
    const menuById = new Map(menu.map((item) => [item.id, item]));
    const tipCents = tipCentsOf(table);
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
                orderNumber: line.orderNumber,
            };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const subtotalCents = items.reduce((total, item) => total + item.lineTotalCents, 0);
    const serviceChargeCents = table.serviceChargeEnabled
        ? percentOfCents(subtotalCents, table.serviceChargePercent)
        : 0;
    const totalCents = subtotalCents + serviceChargeCents + tipCents;

    const guestBreakdown = table.guests.map((guest) => {
        const guestLines = table.lines.filter((line) => line.guestId === guest.id);
        const guestSubtotal = lineSubtotalCents(guestLines, menuById);
        const share = subtotalCents === 0 ? 0 : guestSubtotal / subtotalCents;
        const guestService = Math.round(serviceChargeCents * share);
        const guestTip = Math.round(tipCents * share);
        return {
            name: guest.name,
            subtotalCents: guestSubtotal,
            serviceChargeCents: guestService,
            tipCents: guestTip,
            totalCents: guestSubtotal + guestService + guestTip,
        };
    });

    const guestsWithSpend = guestBreakdown.filter((guest) => guest.subtotalCents > 0);
    if (guestsWithSpend.length > 0) {
        const allocatedService = guestBreakdown.reduce(
            (sum, guest) => sum + guest.serviceChargeCents,
            0,
        );
        const allocatedTip = guestBreakdown.reduce((sum, guest) => sum + guest.tipCents, 0);
        const last = guestsWithSpend[guestsWithSpend.length - 1];
        last.serviceChargeCents += serviceChargeCents - allocatedService;
        last.tipCents += tipCents - allocatedTip;
        last.totalCents = last.subtotalCents + last.serviceChargeCents + last.tipCents;
    }

    return { subtotalCents, serviceChargeCents, tipCents, totalCents, guestBreakdown, items };
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
        orderNumbers: collectOrderNumbers(table.lines),
        items: bill.items,
        guests: bill.guestBreakdown,
        subtotalCents: bill.subtotalCents,
        serviceChargeEnabled: table.serviceChargeEnabled,
        serviceChargePercent: table.serviceChargePercent,
        serviceChargeCents: bill.serviceChargeCents,
        tipCents: bill.tipCents,
        totalCents: bill.totalCents,
        payment: table.payment,
        guestSignatureDataUrl: table.guestSignatureDataUrl,
        guestPreferredPayment: table.guestPreferredPayment,
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
            acc.serviceChargeCents += sale.serviceChargeCents;
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
            serviceChargeCents: 0,
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
        'service_charge',
        'tip',
        'total',
        'method',
        'cash',
        'card',
        'change',
        'order_numbers',
    ];
    const rows = sales.map((sale) =>
        [
            sale.paidAt,
            sale.tableLabel,
            sale.serverName,
            sale.itemCount,
            (sale.subtotalCents / 100).toFixed(2),
            (sale.serviceChargeCents / 100).toFixed(2),
            (sale.tipCents / 100).toFixed(2),
            (sale.totalCents / 100).toFixed(2),
            sale.payment.method,
            (sale.payment.cashCents / 100).toFixed(2),
            (sale.payment.cardCents / 100).toFixed(2),
            (sale.payment.changeDueCents / 100).toFixed(2),
            (sale.orderNumbers ?? []).join('|'),
        ].join(','),
    );
    return [header.join(','), ...rows].join('\n');
}
