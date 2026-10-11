/** Canonical URL guests scan to open the mobile order experience (PWA / web app). */

export function getGuestOrderUrl(origin?: string, options?: { table?: string }): string {
    const fromEnv = import.meta.env.PUBLIC_GUEST_ORDER_URL?.trim();
    let base: string;
    if (fromEnv) {
        base = fromEnv.replace(/\/$/, '');
    } else {
        const originBase =
            origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
        base = originBase ? `${originBase.replace(/\/$/, '')}/order` : '/order';
    }
    const table = options?.table?.trim();
    if (!table) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}table=${encodeURIComponent(table)}`;
}

export function guestOrderQrImageUrl(orderUrl: string, sizePx = 280): string {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${sizePx}x${sizePx}&margin=12&data=${encodeURIComponent(orderUrl)}`;
}

/** Read ?table= from the current guest order page. */
export function readTableFromSearch(search = typeof window !== 'undefined' ? window.location.search : ''): string {
    try {
        return new URLSearchParams(search).get('table')?.trim() || '';
    } catch {
        return '';
    }
}
