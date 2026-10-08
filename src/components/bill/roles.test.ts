import { describe, expect, it } from 'vitest';
import {
    canDeleteTickets,
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

    it('lets servers manage beverage status and payments', () => {
        expect(canUpdateBeverageStatus('server')).toBe(true);
        expect(canTakePayment('server')).toBe(true);
        expect(viewsForRole('server')).toEqual(['service']);
    });
});
