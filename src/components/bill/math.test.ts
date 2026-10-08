import { describe, expect, it } from 'vitest';
import {
    computeBill,
    computePayment,
    getActiveXcgRate,
    percentOfCents,
    setActiveXcgRate,
    tipCentsOf,
    usdCentsToXcgCents,
    xcgCentsToUsdCents,
} from './math';
import type { MenuItem, TableOrder } from './types';

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
];

function table(overrides: Partial<TableOrder> = {}): TableOrder {
    return {
        id: 't1',
        label: 'Table 1',
        status: 'open',
        lines: [
            {
                id: 'l1',
                menuItemId: 'm1',
                quantity: 2,
                guestId: 'g1',
                note: '',
                modifiers: [],
                kitchenStatus: 'draft',
                sentToKitchenAt: null,
                orderNumber: null,
                sentByStaffId: null,
            },
        ],
        guests: [{ id: 'g1', name: 'Guest 1' }],
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
    });

    it('computes cash change due', () => {
        const tender = computePayment(1000, 'cash', 1500, 0);
        expect(tender.changeDueCents).toBe(500);
        expect(tender.cashCents).toBe(1500);
    });
});
