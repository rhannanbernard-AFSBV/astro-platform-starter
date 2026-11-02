import { describe, expect, it } from 'vitest';
import {
    bucketForKitchenStatus,
    collectOversightTickets,
    enrichSalesForOversight,
    filterOversightTickets,
} from './staffOversight';
import type { MenuItem, SaleRecord, StaffUser, TableOrder } from './types';

const staff: StaffUser[] = [
    {
        id: 'staff_server',
        name: 'Alex Server',
        role: 'server',
        pin: '1234',
        initials: 'AS',
    },
    {
        id: 'staff_bar',
        name: 'Morgan Rum',
        role: 'bartender',
        pin: '3333',
        initials: 'MR',
    },
];

const menu: MenuItem[] = [
    {
        id: '1',
        name: 'Jerk Chicken',
        description: '',
        category: 'Mains',
        priceCents: 2450,
        image: '',
        modifierGroups: [],
    },
];

function line(
    overrides: Partial<TableOrder['lines'][number]> = {},
): TableOrder['lines'][number] {
    return {
        id: 'line_1',
        menuItemId: '1',
        quantity: 1,
        guestId: null,
        note: '',
        modifiers: [],
        kitchenStatus: 'queued',
        sentToKitchenAt: '2026-10-11T12:00:00.000Z',
        orderNumber: 'ORD-1',
        sentByStaffId: 'staff_server',
        courseFire: 'fire',
        bumpedAt: null,
        bumpCount: 0,
        unitPriceSnapshotCents: 2450,
        compReason: null,
        ...overrides,
    };
}

describe('staffOversight', () => {
    it('maps kitchen statuses into open/pending/preparing/completed buckets', () => {
        expect(bucketForKitchenStatus('draft', 'open')).toBe('open');
        expect(bucketForKitchenStatus('queued', 'open')).toBe('pending');
        expect(bucketForKitchenStatus('preparing', 'open')).toBe('preparing');
        expect(bucketForKitchenStatus('ready', 'open')).toBe('completed');
        expect(bucketForKitchenStatus('served', 'paid')).toBe('completed');
    });

    it('attributes tickets to the sending staff and filters by staff + bucket', () => {
        const tables: TableOrder[] = [
            {
                id: 't1',
                label: 'Table 1',
                checkKind: 'table',
                status: 'open',
                lines: [
                    line(),
                    line({
                        id: 'line_2',
                        kitchenStatus: 'preparing',
                        sentByStaffId: 'staff_bar',
                        orderNumber: 'ORD-2',
                    }),
                ],
                guests: [],
                tipAmountPreset: 0,
                tipCents: 0,
                serviceChargeEnabled: true,
                serviceChargePercent: 10,
                billGeneratedAt: null,
                paidAt: null,
                payment: null,
                guestSignatureDataUrl: null,
                guestPreferredPayment: null,
                guestBillApprovedAt: null,
            },
        ];

        const tickets = collectOversightTickets(tables, menu, staff);
        expect(tickets).toHaveLength(2);

        const alexPending = filterOversightTickets(tickets, {
            staffId: 'staff_server',
            bucket: 'pending',
        });
        expect(alexPending).toHaveLength(1);
        expect(alexPending[0]?.itemName).toBe('Jerk Chicken');

        const barPreparing = filterOversightTickets(tickets, {
            staffId: 'staff_bar',
            bucket: 'preparing',
        });
        expect(barPreparing).toHaveLength(1);
        expect(barPreparing[0]?.staffName).toBe('Morgan Rum');
    });

    it('enriches sales with serverStaffId for per-staff payment review', () => {
        const sales: SaleRecord[] = [
            {
                id: 'sale_1',
                tableId: 't1',
                tableLabel: 'Table 1',
                paidAt: '2026-10-11T13:00:00.000Z',
                subtotalCents: 2450,
                serviceChargeCents: 245,
                tipCents: 200,
                totalCents: 2895,
                compCents: 0,
                payment: {
                    method: 'cash',
                    cashCents: 2895,
                    cardCents: 0,
                    changeDueCents: 0,
                    paidAt: '2026-10-11T13:00:00.000Z',
                },
                serverName: 'Alex Server',
                serverStaffId: 'staff_server',
                itemCount: 1,
                orderNumbers: ['ORD-1'],
                guestName: null,
                guestId: null,
                checkKind: 'table',
            },
        ];
        const enriched = enrichSalesForOversight(sales, staff);
        expect(enriched[0]?.staffId).toBe('staff_server');
    });
});
