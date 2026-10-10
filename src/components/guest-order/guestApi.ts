import { GUEST_DISHES, type GuestDish } from './menu';

export type GuestFulfillment = 'table' | 'pickup';

export type GuestLocale = {
    town: string;
    country?: string;
    countryCode: string;
    street?: string;
    welcome?: string;
    payNote?: string;
};

export type GuestMenuResponse = {
    source: 'pos' | 'fallback';
    currency: { usd: boolean; xcg?: boolean; xcgPerUsd: number; label?: string };
    locale?: GuestLocale;
    serviceChargePercent?: number;
    tipPresetsCents?: number[];
    kitchen?: { activeTickets: number; estimatedWaitMinutes: number; label: string };
    restaurant: { name: string; tagline: string; phone?: string };
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
    payNote?: string;
    tipCents?: number;
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

const DEFAULT_LOCALE: GuestLocale = {
    town: 'Philipsburg',
    country: 'Sint Maarten',
    countryCode: 'SXM',
    street: '14 Front Street, Philipsburg, Sint Maarten',
    welcome: 'Welcome to Philipsburg — cruise & island guests welcome',
    payNote: 'Pay at the counter in USD or Caribbean guilders (XCG).',
};

export async function fetchGuestMenu(): Promise<{
    dishes: GuestDish[];
    source: 'pos' | 'fallback' | 'static';
    xcgPerUsd: number;
    locale: GuestLocale;
    serviceChargePercent: number;
    tipPresetsCents: number[];
    waitLabel: string;
    currencyLabel: string;
}> {
    const base = apiBase();
    if (!base) {
        return {
            dishes: GUEST_DISHES,
            source: 'static',
            xcgPerUsd: 1.8,
            locale: DEFAULT_LOCALE,
            serviceChargePercent: 5,
            tipPresetsCents: [0, 200, 500, 1000, 1500],
            waitLabel: 'About 8–12 min',
            currencyLabel: 'USD & XCG (1 USD = 1.8 XCG)',
        };
    }
    try {
        const res = await fetch(`${base}/pos/guest/menu`);
        if (!res.ok) throw new Error(`menu ${res.status}`);
        const body = (await res.json()) as GuestMenuResponse;
        return {
            dishes: dishesFromMenuResponse(body),
            source: body.source,
            xcgPerUsd: body.currency.xcgPerUsd,
            locale: { ...DEFAULT_LOCALE, ...body.locale },
            serviceChargePercent: body.serviceChargePercent ?? 5,
            tipPresetsCents: body.tipPresetsCents ?? [0, 200, 500, 1000, 1500],
            waitLabel: body.kitchen?.label || 'About 8–12 min',
            currencyLabel: body.currency.label || `USD & XCG (1 USD = ${body.currency.xcgPerUsd} XCG)`,
        };
    } catch {
        return {
            dishes: GUEST_DISHES,
            source: 'static',
            xcgPerUsd: 1.8,
            locale: DEFAULT_LOCALE,
            serviceChargePercent: 5,
            tipPresetsCents: [0, 200, 500, 1000, 1500],
            waitLabel: 'About 8–12 min',
            currencyLabel: 'USD & XCG (1 USD = 1.8 XCG)',
        };
    }
}

export async function placeGuestOrder(input: {
    fulfillment: GuestFulfillment;
    tableLabel?: string;
    guestName?: string;
    tipCents?: number;
    lines: Array<{ menuItemId: string; quantity: number }>;
}): Promise<GuestOrderStatus> {
    const base = apiBase();
    if (!base) {
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
            payNote: DEFAULT_LOCALE.payNote,
            tipCents: input.tipCents || 0,
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
