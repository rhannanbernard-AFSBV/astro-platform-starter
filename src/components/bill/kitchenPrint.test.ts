import { describe, expect, it } from 'vitest';
import { buildEscPosBytes, buildPrintTicketHtml, ticketFromTable } from './kitchenPrint';
import type { MenuItem, TableOrder } from './types';

describe('kitchenPrint', () => {
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
    const table: TableOrder = {
        id: 't1',
        label: 'Table 12',
        checkKind: 'table',
        status: 'open',
        lines: [
            {
                id: 'line_1',
                menuItemId: '1',
                quantity: 2,
                guestId: null,
                note: 'No onion',
                modifiers: [{ groupId: 'heat', optionId: 'yard', name: 'Yard hot', priceDeltaCents: 0 }],
                kitchenStatus: 'queued',
                sentToKitchenAt: '2026-11-02T12:00:00.000Z',
                orderNumber: 'ORD-42',
                sentByStaffId: 'staff_server',
                courseFire: 'fire',
                bumpedAt: null,
                bumpCount: 0,
                unitPriceSnapshotCents: 2450,
                compReason: null,
            },
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
    };

    it('builds ESC/POS bytes with ticket header and cut', () => {
        const ticket = ticketFromTable({
            kind: 'kitchen',
            table,
            lines: table.lines,
            menuById: new Map(menu.map((item) => [item.id, item])),
            restaurant: {
                name: 'Authentic Jamaican',
                tagline: '',
                address: '',
                phone: '',
                taxId: '',
                feedbackUrl: '',
            },
            serverName: 'Alex',
        });
        const bytes = buildEscPosBytes(ticket);
        expect(bytes.length).toBeGreaterThan(40);
        expect(bytes[0]).toBe(0x1b); // ESC init
        const asText = String.fromCharCode(...bytes.filter((b) => b >= 32 && b < 127));
        expect(asText).toContain('KITCHEN TICKET');
        expect(asText).toContain('Jerk Chicken');
    });

    it('builds printable HTML fallback', () => {
        const ticket = ticketFromTable({
            kind: 'bar',
            table,
            lines: table.lines,
            menuById: new Map(menu.map((item) => [item.id, item])),
            restaurant: {
                name: 'Authentic Jamaican',
                tagline: '',
                address: '',
                phone: '',
                taxId: '',
                feedbackUrl: '',
            },
            serverName: 'Morgan',
        });
        const html = buildPrintTicketHtml(ticket);
        expect(html).toContain('BAR TICKET');
        expect(html).toContain('Yard hot');
        expect(html).toContain('window.print');
    });
});
