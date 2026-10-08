import { describe, expect, it } from 'vitest';
import { createDefaultState, createId } from './defaults';
import {
    applySendFoodToKitchen,
    canGuestTakePayment,
    foodDraftLineIds,
    queueDraftBeverages,
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

function line(menuItemId: string, status: TableOrder['lines'][number]['kitchenStatus'] = 'draft') {
    return {
        id: createId('line'),
        menuItemId,
        quantity: 1,
        guestId: null,
        note: '',
        modifiers: [],
        kitchenStatus: status,
        sentToKitchenAt: null,
        orderNumber: null,
        sentByStaffId: null,
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

    it('queues beverages when guest ticket is generated', () => {
        const table: TableOrder = {
            ...createDefaultState().tables[0],
            lines: [line('drink')],
            billGeneratedAt: new Date().toISOString(),
        };
        const menuById = new Map(menu.map((item) => [item.id, item]));
        const next = queueDraftBeverages(table, menuById, 'staff_server');
        expect(next.lines[0].kitchenStatus).toBe('queued');
        expect(next.lines[0].sentToKitchenAt).toBeNull();
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
                status: 'paid',
            }),
        ).toBe('paid');
    });
});
