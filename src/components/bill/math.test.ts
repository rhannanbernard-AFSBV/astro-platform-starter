import { describe, expect, it } from 'vitest';
import {
    buildSnapshot,
    computeBill,
    computePayment,
    effectiveMenuPriceCents,
    formatShiftCloseSummary,
    getActiveXcgRate,
    percentOfCents,
    setActiveXcgRate,
    summarizeSalesByStation,
    tipCentsOf,
    unitPriceCents,
    usdCentsToXcgCents,
    xcgCentsToUsdCents,
} from './math';
import type { MenuItem, OrderLine, SaleRecord, TableOrder } from './types';

const menu: MenuItem[] = [
    {
        id: 'm1',
        name: 'Pasta',
        description: '',
        category: 'Mains',
        priceCents: 2000,
        image: '',
        modifierGroups: [],
    },
    {
        id: 'd1',
        name: 'Cola',
        description: '',
        category: 'Drinks',
        priceCents: 500,
        image: '',
        happyHour: { priceCents: 350, startHour: 16, endHour: 19 },
        modifierGroups: [],
    },
];

function line(partial: Partial<OrderLine> & Pick<OrderLine, 'id' | 'menuItemId'>): OrderLine {
    return {
        quantity: 1,
        guestId: 'g1',
        note: '',
        modifiers: [],
        kitchenStatus: 'draft',
        sentToKitchenAt: null,
        orderNumber: null,
        sentByStaffId: null,
        courseFire: 'fire',
        bumpedAt: null,
        bumpCount: 0,
        unitPriceSnapshotCents: null,
        compReason: null,
        ...partial,
    };
}

function table(overrides: Partial<TableOrder> = {}): TableOrder {
    return {
        id: 't1',
        label: 'Table 1',
        checkKind: 'table',
        status: 'open',
        lines: [
            line({
                id: 'l1',
                menuItemId: 'm1',
                quantity: 2,
            }),
        ],
        guests: [{ id: 'g1', name: 'Guest 1', paidAt: null, payment: null }],
        tipAmountPreset: 500,
        tipCents: 500,
        serviceChargeEnabled: true,
        serviceChargePercent: 5,
        billGeneratedAt: null,
        paidAt: null,
        payment: null,
        guestSignatureDataUrl: null,
        guestPreferredPayment: null,
        guestBillApprovedAt: null,
        ...overrides,
    };
}

describe('money math', () => {
    it('converts USD cents to XCG using active rate', () => {
        setActiveXcgRate(1.8);
        expect(getActiveXcgRate()).toBe(1.8);
        expect(usdCentsToXcgCents(100)).toBe(180);
        expect(xcgCentsToUsdCents(180)).toBe(100);
    });

    it('supports custom FX rate', () => {
        setActiveXcgRate(2);
        expect(usdCentsToXcgCents(100)).toBe(200);
        setActiveXcgRate(1.8);
    });

    it('computes tip as currency and service charge as percent', () => {
        const bill = computeBill(table(), menu);
        expect(bill.subtotalCents).toBe(4000);
        expect(bill.serviceChargeCents).toBe(percentOfCents(4000, 5));
        expect(bill.tipCents).toBe(500);
        expect(tipCentsOf(table({ tipAmountPreset: 'custom', tipCents: 123 }))).toBe(123);
        expect(bill.totalCents).toBe(4000 + 200 + 500);
        expect(bill.guestBreakdown[0].id).toBe('g1');
    });

    it('computes cash change due', () => {
        const tender = computePayment(1000, 'cash', 1500, 0);
        expect(tender.changeDueCents).toBe(500);
        expect(tender.cashCents).toBe(1500);
    });

    it('builds kitchen receipt template without drinks or prices payload fields for guest', () => {
        const order = table({
            lines: [
                line({
                    id: 'l1',
                    menuItemId: 'm1',
                    kitchenStatus: 'queued',
                    sentToKitchenAt: new Date().toISOString(),
                    orderNumber: 'ORD-1',
                    sentByStaffId: 'staff_server',
                    courseFire: 'hold',
                }),
                line({
                    id: 'l2',
                    menuItemId: 'd1',
                    kitchenStatus: 'queued',
                    sentByStaffId: 'staff_server',
                }),
            ],
        });
        const kitchen = buildSnapshot(order, menu, undefined, 'Server', 'kitchen');
        expect(kitchen.template).toBe('kitchen');
        expect(kitchen.items).toHaveLength(1);
        expect(kitchen.items[0].name).toBe('Pasta');
        expect(kitchen.payment).toBeNull();
    });

    it('applies happy hour and locks snapshot / comps', () => {
        const drink = menu[1];
        const during = new Date('2026-10-09T17:00:00');
        const outside = new Date('2026-10-09T12:00:00');
        expect(effectiveMenuPriceCents(drink, during)).toBe(350);
        expect(effectiveMenuPriceCents(drink, outside)).toBe(500);

        const snapped = line({
            id: 'd',
            menuItemId: 'd1',
            unitPriceSnapshotCents: 350,
        });
        expect(unitPriceCents(drink, snapped, outside)).toBe(350);

        const comped = { ...snapped, compReason: 'VIP / host' };
        expect(unitPriceCents(drink, comped)).toBe(0);
        const bill = computeBill(
            table({
                tipAmountPreset: 0,
                tipCents: 0,
                serviceChargeEnabled: false,
                lines: [comped],
            }),
            menu,
        );
        expect(bill.subtotalCents).toBe(0);
        expect(bill.compCents).toBe(350);
    });

    it('splits shift day-part totals by floor vs bar station', () => {
        const payment = {
            method: 'cash' as const,
            cashCents: 1000,
            cardCents: 0,
            changeDueCents: 0,
            paidAt: '2026-10-09T20:00:00.000Z',
        };
        const sales: SaleRecord[] = [
            {
                id: 's1',
                tableId: 't1',
                tableLabel: 'Table 12',
                paidAt: payment.paidAt,
                subtotalCents: 2000,
                serviceChargeCents: 100,
                tipCents: 200,
                totalCents: 2300,
                compCents: 0,
                payment,
                serverName: 'Alex',
                itemCount: 2,
                orderNumbers: [],
                guestName: null,
                guestId: null,
                checkKind: 'table',
            },
            {
                id: 's2',
                tableId: 'b1',
                tableLabel: 'Tab · Pat',
                paidAt: payment.paidAt,
                subtotalCents: 900,
                serviceChargeCents: 45,
                tipCents: 0,
                totalCents: 945,
                compCents: 100,
                payment: { ...payment, method: 'card', cashCents: 0, cardCents: 945 },
                serverName: 'Morgan',
                itemCount: 1,
                orderNumbers: [],
                guestName: 'Pat',
                guestId: null,
                checkKind: 'bar_tab',
            },
        ];
        const stations = summarizeSalesByStation(sales);
        expect(stations.floor.totalCents).toBe(2300);
        expect(stations.bar.totalCents).toBe(945);
        expect(stations.bar.compCents).toBe(100);
        const text = formatShiftCloseSummary(sales);
        expect(text).toContain('Floor ·');
        expect(text).toContain('Bar ·');
    });
});
