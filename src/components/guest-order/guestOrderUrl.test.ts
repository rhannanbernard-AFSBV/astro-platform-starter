import { describe, expect, it } from 'vitest';
import { getGuestOrderUrl, guestOrderQrImageUrl } from './guestOrderUrl';

describe('getGuestOrderUrl', () => {
    it('uses explicit origin when env is unset', () => {
        expect(getGuestOrderUrl('https://demo.example')).toBe('https://demo.example/order');
    });

    it('builds qr image URL with encoded payload', () => {
        const url = guestOrderQrImageUrl('https://demo.example/order', 200);
        expect(url).toContain('200x200');
        expect(url).toContain(encodeURIComponent('https://demo.example/order'));
    });
});
