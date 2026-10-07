import type { BillSnapshot, MenuItem, TableOrder, TipPreset } from './types';

export const money = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function tipPercentOf(table: Pick<TableOrder, 'tipPreset' | 'tipCustomPercent'>): number {
    return table.tipPreset === 'custom' ? Math.max(0, table.tipCustomPercent) : table.tipPreset;
}

export function percentOfCents(amountCents: number, percent: number): number {
    return Math.round((amountCents * percent) / 100);
}

export function lineSubtotalCents(lines: TableOrder['lines'], menuById: Map<string, MenuItem>): number {
    return lines.reduce((total, line) => {
        const item = menuById.get(line.menuItemId);
        if (!item) return total;
        return total + item.priceCents * line.quantity;
    }, 0);
}

export function computeBill(table: TableOrder, menu: MenuItem[]): {
    subtotalCents: number;
    taxCents: number;
    tipCents: number;
    totalCents: number;
    tipPercent: number;
    guestBreakdown: BillSnapshot['guests'];
    items: BillSnapshot['items'];
} {
    const menuById = new Map(menu.map((item) => [item.id, item]));
    const tipPercent = tipPercentOf(table);
    const items = table.lines
        .map((line) => {
            const item = menuById.get(line.menuItemId);
            if (!item) return null;
            const guest = table.guests.find((entry) => entry.id === line.guestId);
            return {
                name: item.name,
                quantity: line.quantity,
                unitPriceCents: item.priceCents,
                lineTotalCents: item.priceCents * line.quantity,
                guestName: guest?.name ?? null,
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

    // Fix rounding drift on the last guest with items
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

export function buildSnapshot(table: TableOrder, menu: MenuItem[]): BillSnapshot {
    const bill = computeBill(table, menu);
    return {
        restaurant: 'Savory Kitchen & Bar',
        tableLabel: table.label,
        generatedAt: table.billGeneratedAt ?? new Date().toISOString(),
        status: table.status,
        items: bill.items,
        guests: bill.guestBreakdown,
        subtotalCents: bill.subtotalCents,
        taxEnabled: table.taxEnabled,
        taxPercent: table.taxPercent,
        taxCents: bill.taxCents,
        tipPercent: bill.tipPercent,
        tipCents: bill.tipCents,
        totalCents: bill.totalCents,
    };
}

export function encodeSnapshot(snapshot: BillSnapshot): string {
    const json = JSON.stringify(snapshot);
    return btoa(unescape(encodeURIComponent(json)));
}

export function decodeSnapshot(encoded: string): BillSnapshot | null {
    try {
        const json = decodeURIComponent(escape(atob(encoded)));
        return JSON.parse(json) as BillSnapshot;
    } catch {
        return null;
    }
}

export function tipLabel(preset: TipPreset, customPercent: number): string {
    return preset === 'custom' ? `${customPercent}%` : `${preset}%`;
}
