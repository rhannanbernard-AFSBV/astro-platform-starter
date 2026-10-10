import { describe, expect, it } from 'vitest';
import { getGuestOrderUrl, guestOrderQrImageUrl, readTableFromSearch } from './guestOrderUrl';

describe('getGuestOrderUrl', () => {
    it('uses explicit origin when env is unset', () => {
        expect(getGuestOrderUrl('https://demo.example')).toBe('https://demo.example/order');
    });

    it('appends table deep-link for Philipsburg table tents', () => {
        expect(getGuestOrderUrl('https://demo.example', { table: '12' })).toBe(
            'https://demo.example/order?table=12',
        );
    });

    it('builds qr image URL with encoded payload', () => {
        const url = guestOrderQrImageUrl('https://demo.example/order?table=12', 200);
        expect(url).toContain('200x200');
        expect(url).toContain(encodeURIComponent('https://demo.example/order?table=12'));
    });

    it('reads table from search string', () => {
        expect(readTableFromSearch('?table=14')).toBe('14');
        expect(readTableFromSearch('')).toBe('');
    });
});
