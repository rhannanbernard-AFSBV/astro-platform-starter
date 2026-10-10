import { GUEST_DISHES, type GuestDish } from './menu';

export type GuestFulfillment = 'table' | 'pickup';

export type GuestMenuResponse = {
    source: 'pos' | 'fallback';
    currency: { usd: boolean; xcgPerUsd: number };
    restaurant: { name: string; tagline: string };
    items: Array<{
        id: string;
        name: string;
        description: string;
        tagline: string;
        category: string;
        posCategory?: string;
        priceCents: number;
        image: string;
        popular?: boolean;
    }>;
    payAtCounter: boolean;
};

export type GuestOrderStatus = {
    token: string;
    orderNumber: string | null;
    label: string | null;
    fulfillment: GuestFulfillment;
    guestName: string | null;
    phase: 'received' | 'preparing' | 'ready' | 'paid' | string;
    payAtCounter: boolean;
    tableStatus?: string;
    lines: Array<{
        id: string;
        name: string;
        quantity: number;
        status: string;
        priceCents: number;
    }>;
};

function apiBase(): string | null {
    const raw =
        (import.meta as ImportMeta & { env?: Record<string, string> }).env?.PUBLIC_POS_API_URL ??
        (typeof window !== 'undefined'
            ? (window as unknown as { __POS_API_URL__?: string }).__POS_API_URL__
            : undefined);
    if (!raw || !String(raw).trim()) return null;
    return String(raw).replace(/\/$/, '');
}

export function isGuestApiConfigured(): boolean {
    return Boolean(apiBase());
}

export function dishesFromMenuResponse(menu: GuestMenuResponse): GuestDish[] {
    return menu.items.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category as GuestDish['category'],
        tagline: item.tagline || item.description.slice(0, 72),
        description: item.description,
        priceCents: item.priceCents,
        image: item.image,
        popular: item.popular,
    }));
}

export async function fetchGuestMenu(): Promise<{
    dishes: GuestDish[];
    source: 'pos' | 'fallback' | 'static';
    xcgPerUsd: number;
}> {
    const base = apiBase();
    if (!base) {
        return { dishes: GUEST_DISHES, source: 'static', xcgPerUsd: 1.8 };
    }
    try {
        const res = await fetch(`${base}/pos/guest/menu`);
        if (!res.ok) throw new Error(`menu ${res.status}`);
        const body = (await res.json()) as GuestMenuResponse;
        return {
            dishes: dishesFromMenuResponse(body),
            source: body.source,
            xcgPerUsd: body.currency.xcgPerUsd,
        };
    } catch {
        return { dishes: GUEST_DISHES, source: 'static', xcgPerUsd: 1.8 };
    }
}

export async function placeGuestOrder(input: {
    fulfillment: GuestFulfillment;
    tableLabel?: string;
    guestName?: string;
    lines: Array<{ menuItemId: string; quantity: number }>;
}): Promise<GuestOrderStatus> {
    const base = apiBase();
    if (!base) {
        // Local demo — status only on this device (kitchen will not see it).
        const token = `go_demo_${Date.now().toString(36)}`;
        const demo: GuestOrderStatus = {
            token,
            orderNumber: `D-${String(Date.now()).slice(-4)}`,
            label:
                input.fulfillment === 'pickup'
                    ? `Pickup · ${input.guestName || 'Guest'}`
                    : `Table ${input.tableLabel || '?'}`,
            fulfillment: input.fulfillment,
            guestName: input.guestName || 'Guest',
            phase: 'received',
            payAtCounter: true,
            lines: input.lines.map((line, index) => {
                const dish = GUEST_DISHES.find((d) => d.id === line.menuItemId);
                return {
                    id: `demo_${index}`,
                    name: dish?.name || line.menuItemId,
                    quantity: line.quantity,
                    status: 'queued',
                    priceCents: dish?.priceCents || 0,
                };
            }),
        };
        sessionStorage.setItem(`guest-order:${token}`, JSON.stringify(demo));
        return demo;
    }
    const res = await fetch(`${base}/pos/guest/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
    if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `Order failed (${res.status})`);
    }
    return (await res.json()) as GuestOrderStatus;
}

export async function fetchGuestOrderStatus(token: string): Promise<GuestOrderStatus | null> {
    if (token.startsWith('go_demo_')) {
        const raw = sessionStorage.getItem(`guest-order:${token}`);
        return raw ? (JSON.parse(raw) as GuestOrderStatus) : null;
    }
    const base = apiBase();
    if (!base) return null;
    const res = await fetch(`${base}/pos/guest/orders/${encodeURIComponent(token)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`status ${res.status}`);
    return (await res.json()) as GuestOrderStatus;
}
