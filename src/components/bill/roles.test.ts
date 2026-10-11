import { describe, expect, it } from 'vitest';
import {
    canCompLine,
    canCreateOrders,
    canDeleteTickets,
    canEightySix,
    canOpenBarTab,
    canRunBarBoard,
    canSendToBar,
    canTakePayment,
    canUpdateBeverageStatus,
    viewsForRole,
} from './roles';

describe('roles', () => {
    it('limits kitchen to kitchen view and blocks deletes', () => {
        expect(viewsForRole('kitchen')).toEqual(['kitchen']);
        expect(canDeleteTickets('kitchen')).toBe(false);
        expect(canDeleteTickets('manager')).toBe(true);
        expect(canTakePayment('kitchen')).toBe(false);
    });

    it('gives bartender bar + service and drink revenue powers', () => {
        expect(viewsForRole('bartender')).toEqual(['bar', 'service']);
        expect(canRunBarBoard('bartender')).toBe(true);
        expect(canUpdateBeverageStatus('bartender')).toBe(true);
        expect(canCreateOrders('bartender')).toBe(true);
        expect(canSendToBar('bartender')).toBe(true);
        expect(canTakePayment('bartender')).toBe(true);
        expect(canOpenBarTab('bartender')).toBe(true);
        expect(canCompLine('bartender', true)).toBe(true);
        expect(canCompLine('bartender', false)).toBe(false);
        expect(canEightySix('bartender')).toBe(true);
        expect(canSendToBar('server')).toBe(true);
    });

    it('lets servers manage beverage status and payments', () => {
        expect(canUpdateBeverageStatus('server')).toBe(true);
        expect(canTakePayment('server')).toBe(true);
        expect(viewsForRole('server')).toEqual(['service']);
    });

    it('includes bar in manager views', () => {
        expect(viewsForRole('manager')).toContain('bar');
        expect(viewsForRole('admin')).toContain('bar');
    });
});
