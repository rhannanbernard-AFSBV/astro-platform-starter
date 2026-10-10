/** Canonical URL guests scan to open the mobile order experience (PWA / web app). */
export function getGuestOrderUrl(origin?: string): string {
    const fromEnv = import.meta.env.PUBLIC_GUEST_ORDER_URL?.trim();
    if (fromEnv) {
        return fromEnv.replace(/\/$/, '');
    }
    const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
    if (base) {
        return `${base.replace(/\/$/, '')}/order`;
    }
    return '/order';
}

export function guestOrderQrImageUrl(orderUrl: string, sizePx = 280): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&margin=12&data=${encodeURIComponent(orderUrl)}`;
}
