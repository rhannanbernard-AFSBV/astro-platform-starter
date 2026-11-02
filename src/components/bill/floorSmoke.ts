/**
 * Programmatic floor smoke path for Authentic Jamaican Cuisine & Bar POS.
 * Mirrors docs/POS_FLOOR_SMOKE.md — no browser required (runs in vitest).
 */
import { createBarTab, createDefaultState, createId } from './defaults';
import {
    computeBill,
    computePayment,
    formatShiftCloseSummary,
    summarizeSalesByStation,
} from './math';
import {
    applySendDrinksToBar,
    applySendFoodToKitchen,
    canGuestTakePayment,
    isShiftAcceptingPayments,
    memoryFromClosedBarTab,
} from './posLogic';
import type { OrderLine, PersistedState, SaleRecord, SelectedModifier } from './types';

export type FloorSmokeResult = {
    ok: true;
    orderNumbers: string[];
    floorTotalCents: number;
    barTotalCents: number;
    shiftCloseText: string;
    reopenedTabLabel: string;
};

function draftLine(menuItemId: string, guestId: string | null = null): OrderLine {
    return {
        id: createId('line'),
        menuItemId,
        quantity: 1,
        guestId,
        note: '',
        modifiers: [] as SelectedModifier[],
        kitchenStatus: 'draft',
        sentToKitchenAt: null,
        orderNumber: null,
        sentByStaffId: null,
        courseFire: 'fire',
        bumpedAt: null,
        bumpCount: 0,
        unitPriceSnapshotCents: null,
        compReason: null,
    };
}

/**
 * Walk: open shift → table food+drink → fire kitchen/bar → guest approve →
 * pay → bar tab pay → close tab → reopen → close shift with station totals.
 */
export function runFloorSmokeScenario(now = new Date()): FloorSmokeResult {
    let state: PersistedState = {
        ...createDefaultState(),
        settings: {
            ...createDefaultState().settings,
            shiftOpenedAt: now.toISOString(),
            shiftClosedAt: null,
            autoFireDrinks: false,
        },
        sales: [],
    };

    if (!isShiftAcceptingPayments(state.settings)) {
        throw new Error('Shift should accept payments after open');
    }

    const menuById = new Map(state.menu.map((item) => [item.id, item]));
    const food = state.menu.find((item) => item.category === 'Mains');
    const drink = state.menu.find((item) => item.category === 'Drinks' || item.category === 'Rum');
    if (!food || !drink) throw new Error('Seed menu missing food/drink');

    // Floor table path
    const tableId = state.tables[0].id;
    state = {
        ...state,
        activeTableId: tableId,
        tables: state.tables.map((table) =>
            table.id !== tableId
                ? table
                : {
                      ...table,
                      lines: [
                          draftLine(food.id, table.guests[0]?.id ?? null),
                          draftLine(drink.id, table.guests[0]?.id ?? null),
                      ],
                  },
        ),
    };

    const foodSend = applySendFoodToKitchen(state, menuById);
    state = foodSend.state;
    if (foodSend.sentCount < 1) throw new Error('Expected food sent to kitchen');

    const drinkSend = applySendDrinksToBar(state, menuById);
    state = drinkSend.state;
    if (drinkSend.sentCount < 1) throw new Error('Expected drinks sent to bar');

    const active = state.tables.find((table) => table.id === tableId);
    if (!active) throw new Error('Active table missing');
    const orderNumbers = active.lines
        .map((line) => line.orderNumber)
        .filter((n): n is string => Boolean(n));
    if (orderNumbers.length < 1) throw new Error('Expected order numbers');

    const approvedAt = now.toISOString();
    state = {
        ...state,
        tables: state.tables.map((table) =>
            table.id !== tableId
                ? table
                : {
                      ...table,
                      billGeneratedAt: approvedAt,
                      guestBillApprovedAt: approvedAt,
                      guestPreferredPayment: 'cash',
                      tipAmountPreset: 200,
                      tipCents: 200,
                  },
        ),
    };
    const approvedTable = state.tables.find((table) => table.id === tableId)!;
    if (!canGuestTakePayment(approvedTable)) {
        throw new Error('Guest bill not ready for payment');
    }

    const bill = computeBill(approvedTable, state.menu);
    const payment = computePayment(bill.totalCents, 'cash', bill.totalCents + 500, 0);
    const floorSale: SaleRecord = {
        id: createId('sale'),
        tableId,
        tableLabel: approvedTable.label,
        paidAt: payment.paidAt,
        subtotalCents: bill.subtotalCents,
        serviceChargeCents: bill.serviceChargeCents,
        tipCents: bill.tipCents,
        totalCents: bill.totalCents,
        compCents: bill.compCents,
        payment,
        serverName: 'Alex Morgan',
        itemCount: approvedTable.lines.reduce((n, line) => n + line.quantity, 0),
        orderNumbers,
        guestName: approvedTable.guests[0]?.name ?? null,
        guestId: approvedTable.guests[0]?.id ?? null,
        checkKind: 'table',
    };

    state = {
        ...state,
        sales: [floorSale, ...state.sales],
        tables: state.tables.map((table) =>
            table.id !== tableId
                ? table
                : {
                      ...table,
                      status: 'paid',
                      paidAt: payment.paidAt,
                      payment,
                      lines: table.lines.map((line) =>
                          line.kitchenStatus === 'draft'
                              ? line
                              : { ...line, kitchenStatus: 'served' as const },
                      ),
                  },
        ),
    };

    // Bar tab path
    const tab = createBarTab('Smoke Guest', state.settings.defaultServiceChargePercent);
    tab.lines = [draftLine(drink.id, tab.guests[0]?.id ?? null)];
    state = {
        ...state,
        tables: [...state.tables, tab],
        activeTableId: tab.id,
    };
    const barFire = applySendDrinksToBar(state, menuById);
    state = barFire.state;
    const liveTab = state.tables.find((table) => table.id === tab.id)!;
    const barBill = computeBill(
        {
            ...liveTab,
            tipAmountPreset: 0,
            tipCents: 0,
            billGeneratedAt: approvedAt,
            guestBillApprovedAt: approvedAt,
            guestPreferredPayment: 'card',
        },
        state.menu,
    );
    const barPay = computePayment(barBill.totalCents, 'card', 0, barBill.totalCents);
    const barSale: SaleRecord = {
        id: createId('sale'),
        tableId: tab.id,
        tableLabel: liveTab.label,
        paidAt: barPay.paidAt,
        subtotalCents: barBill.subtotalCents,
        serviceChargeCents: barBill.serviceChargeCents,
        tipCents: barBill.tipCents,
        totalCents: barBill.totalCents,
        compCents: barBill.compCents,
        payment: barPay,
        serverName: 'Morgan Rum',
        itemCount: 1,
        orderNumbers: liveTab.lines.map((l) => l.orderNumber).filter((n): n is string => Boolean(n)),
        guestName: 'Smoke Guest',
        guestId: liveTab.guests[0]?.id ?? null,
        checkKind: 'bar_tab',
    };

    const paidTab = {
        ...liveTab,
        status: 'paid' as const,
        paidAt: barPay.paidAt,
        payment: barPay,
        lines: liveTab.lines.map((line) => ({ ...line, kitchenStatus: 'served' as const })),
    };
    const memory = memoryFromClosedBarTab(paidTab);
    if (!memory) throw new Error('Expected closed bar tab memory');

    state = {
        ...state,
        sales: [barSale, ...state.sales],
        tables: state.tables.filter((table) => table.id !== tab.id),
        activeTableId: tableId,
    };

    const reopened = createBarTab(memory.guestName, state.settings.defaultServiceChargePercent);
    state = {
        ...state,
        tables: [...state.tables, reopened],
        activeTableId: reopened.id,
    };

    const stations = summarizeSalesByStation(state.sales);
    if (stations.floor.count < 1 || stations.bar.count < 1) {
        throw new Error('Expected floor and bar sales in day-part summary');
    }

    state = {
        ...state,
        settings: {
            ...state.settings,
            shiftClosedAt: now.toISOString(),
        },
    };
    if (isShiftAcceptingPayments(state.settings)) {
        throw new Error('Closed shift must block payments');
    }

    return {
        ok: true,
        orderNumbers,
        floorTotalCents: stations.floor.totalCents,
        barTotalCents: stations.bar.totalCents,
        shiftCloseText: formatShiftCloseSummary(state.sales),
        reopenedTabLabel: reopened.label,
    };
}
