import { describe, expect, it } from 'vitest';
import {
    canDeleteTickets,
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

    it('gives bartender a dedicated bar rail', () => {
        expect(viewsForRole('bartender')).toEqual(['bar']);
        expect(canRunBarBoard('bartender')).toBe(true);
        expect(canUpdateBeverageStatus('bartender')).toBe(true);
        expect(canTakePayment('bartender')).toBe(false);
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
