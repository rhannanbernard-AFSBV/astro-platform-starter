import { describe, expect, it } from 'vitest';
import { createDefaultState, createId } from './defaults';
import {
    allGuestsPaid,
    applySendDrinksToBar,
    applySendFoodToKitchen,
    bumpKitchenLine,
    canGuestTakePayment,
    drinkDraftLineIds,
    foodDraftLineIds,
    isTicketLate,
    parseStationParam,
    recallKitchenLine,
    tableStatusTone,
} from './posLogic';
import type { MenuItem, TableOrder } from './types';

const menu: MenuItem[] = [
    {
        id: 'food',
        name: 'Burger',
        description: '',
        category: 'Mains',
        priceCents: 1000,
        image: '',
        modifierGroups: [],
    },
    {
        id: 'drink',
        name: 'Cola',
        description: '',
        category: 'Drinks',
        priceCents: 300,
        image: '',
        modifierGroups: [],
    },
];

function line(
    menuItemId: string,
    status: TableOrder['lines'][number]['kitchenStatus'] = 'draft',
) {
    return {
        id: createId('line'),
        menuItemId,
        quantity: 1,
        guestId: null,
        note: '',
        modifiers: [],
        kitchenStatus: status,
        sentToKitchenAt:
            status === 'draft' ? null : new Date(Date.now() - 12 * 60_000).toISOString(),
        orderNumber: status === 'draft' ? null : 'ORD-TEST-0001',
        sentByStaffId: status === 'draft' ? null : 'staff_server',
        courseFire: 'fire' as const,
        bumpedAt: null,
        bumpCount: 0,
    };
}

describe('posLogic kitchen vs beverages', () => {
    it('only sends food drafts to kitchen', () => {
        const state = createDefaultState();
        const table = state.tables[0];
        table.lines = [line('food'), line('drink')];
        state.tables[0] = table;
        state.activeTableId = table.id;
        const menuById = new Map(menu.map((item) => [item.id, item]));

        expect(foodDraftLineIds(table, menuById)).toHaveLength(1);

        const result = applySendFoodToKitchen(state, menuById);
        expect(result.sentCount).toBe(1);
        const next = result.state.tables[0];
        const food = next.lines.find((entry) => entry.menuItemId === 'food');
        const drink = next.lines.find((entry) => entry.menuItemId === 'drink');
        expect(food?.kitchenStatus).toBe('queued');
        expect(food?.orderNumber).toMatch(/^ORD-/);
        expect(drink?.kitchenStatus).toBe('draft');
    });

    it('sends drink drafts to the bar rail', () => {
        const state = createDefaultState();
        const table = state.tables[0];
        table.lines = [line('food'), line('drink')];
        state.tables[0] = table;
        state.activeTableId = table.id;
        const menuById = new Map(menu.map((item) => [item.id, item]));

        expect(drinkDraftLineIds(table, menuById)).toHaveLength(1);

        const result = applySendDrinksToBar(state, menuById);
        expect(result.sentCount).toBe(1);
        const next = result.state.tables[0];
        const food = next.lines.find((entry) => entry.menuItemId === 'food');
        const drink = next.lines.find((entry) => entry.menuItemId === 'drink');
        expect(food?.kitchenStatus).toBe('draft');
        expect(drink?.kitchenStatus).toBe('queued');
        expect(drink?.orderNumber).toMatch(/^ORD-/);
        expect(result.state.notifications.some((n) => n.kind === 'bar_ticket')).toBe(true);
    });

    it('requires guest approval before take payment', () => {
        const table = createDefaultState().tables[0];
        expect(canGuestTakePayment(table)).toBe(false);
        expect(
            canGuestTakePayment({
                ...table,
                guestBillApprovedAt: new Date().toISOString(),
                guestPreferredPayment: 'card',
            }),
        ).toBe(true);
    });

    it('maps table tones for the floor map', () => {
        const open = createDefaultState().tables[1];
        expect(tableStatusTone(open)).toBe('open');
        expect(
            tableStatusTone({
                ...open,
                lines: [line('food', 'ready')],
            }),
        ).toBe('ready');
        expect(
            tableStatusTone({
                ...open,
                status: 'partial',
            }),
        ).toBe('partial');
        expect(
            tableStatusTone({
                ...open,
                status: 'paid',
            }),
        ).toBe('paid');
    });

    it('bumps and recalls kitchen tickets', () => {
        const state = createDefaultState();
        const foodLine = line('food', 'queued');
        state.tables[0].lines = [foodLine];
        const staff = state.staff[0];
        const bumped = bumpKitchenLine(state, state.tables[0].id, foodLine.id, staff);
        const nextLine = bumped.tables[0].lines[0];
        expect(nextLine.bumpCount).toBe(1);
        expect(nextLine.bumpedAt).toBeTruthy();
        expect(bumped.notifications.some((n) => n.kind === 'bump_alert')).toBe(true);

        const servedState = {
            ...bumped,
            tables: bumped.tables.map((table, index) =>
                index === 0
                    ? {
                          ...table,
                          lines: table.lines.map((entry) => ({
                              ...entry,
                              kitchenStatus: 'served' as const,
                          })),
                      }
                    : table,
            ),
        };
        const recalled = recallKitchenLine(servedState, state.tables[0].id, foodLine.id);
        expect(recalled.tables[0].lines[0].kitchenStatus).toBe('ready');
    });

    it('flags late tickets after bump threshold', () => {
        const late = line('food', 'queued');
        expect(isTicketLate(late, 8)).toBe(true);
        expect(isTicketLate({ ...late, courseFire: 'hold' }, 8)).toBe(false);
    });

    it('parses station deep-link params', () => {
        expect(parseStationParam('kitchen')).toBe('kitchen');
        expect(parseStationParam('expo')).toBe('kitchen');
        expect(parseStationParam('bar')).toBe('bar');
        expect(parseStationParam('drinks')).toBe('bar');
        expect(parseStationParam('floor')).toBe('service');
        expect(parseStationParam('nope')).toBeNull();
    });

    it('detects when all spenders are paid', () => {
        const base = createDefaultState().tables[0];
        const g1 = base.guests[0];
        const g2 = { id: 'g2', name: 'Guest 2', paidAt: null, payment: null };
        const order: TableOrder = {
            ...base,
            guests: [g1, g2],
            lines: [
                { ...line('food'), guestId: g1.id },
                { ...line('food'), guestId: g2.id },
            ],
        };
        expect(allGuestsPaid(order)).toBe(false);
        expect(
            allGuestsPaid({
                ...order,
                guests: [
                    { ...g1, paidAt: new Date().toISOString() },
                    { ...g2, paidAt: new Date().toISOString() },
                ],
            }),
        ).toBe(true);
    });
});
