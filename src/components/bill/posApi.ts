/**
 * Production POS API client.
 * When PUBLIC_POS_API_URL is set, the SPA uses the server as source of truth.
 */

import type { PersistedState, SaleRecord, StaffUser } from './types';

const TOKEN_KEY = 'savory-pos-session-token';

export type PosSession = {
    token: string;
    expiresAt: string;
    tenantId: string;
    staff: Pick<StaffUser, 'id' | 'name' | 'role' | 'initials'>;
};

export type PosConfig = {
    defaultTenantId: string;
    stripeConfigured: boolean;
    stripePublishableKey: string | null;
    requiresLogin: boolean;
};

function apiBase(): string | null {
    const raw =
        (import.meta as ImportMeta & { env?: Record<string, string> }).env
            ?.PUBLIC_POS_API_URL ??
        (typeof window !== 'undefined'
            ? (window as unknown as { __POS_API_URL__?: string }).__POS_API_URL__
            : undefined);
    if (!raw || !String(raw).trim()) return null;
    return String(raw).replace(/\/$/, '');
}

export function isServerMode(): boolean {
    return Boolean(apiBase());
}

export function getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
    if (typeof window === 'undefined') return;
    if (!token) window.localStorage.removeItem(TOKEN_KEY);
    else window.localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(
    path: string,
    init: RequestInit & { token?: string | null } = {},
): Promise<T> {
    const base = apiBase();
    if (!base) throw new Error('POS API URL not configured');
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    const token = init.token === undefined ? getStoredToken() : init.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${base}${path}`, { ...init, headers });
    if (!res.ok) {
        let detail: unknown = res.statusText;
        try {
            detail = await res.json();
        } catch {
            /* ignore */
        }
        const err = new Error(
            typeof detail === 'object' && detail && 'detail' in detail
                ? JSON.stringify((detail as { detail: unknown }).detail)
                : `POS API ${res.status}`,
        ) as Error & { status?: number; detail?: unknown };
        err.status = res.status;
        err.detail = detail;
        throw err;
    }
    return (await res.json()) as T;
}

export async function fetchPosConfig(): Promise<PosConfig | null> {
    const base = apiBase();
    if (!base) return null;
    try {
        return await request<PosConfig>('/pos/config', { token: null });
    } catch {
        return null;
    }
}

export async function probePosHealth(): Promise<boolean> {
    const base = apiBase();
    if (!base) return false;
    try {
        const res = await fetch(`${base}/pos/health`);
        return res.ok;
    } catch {
        return false;
    }
}

export async function loginWithPin(pin: string, tenantId?: string): Promise<PosSession> {
    const data = await request<{
        token: string;
        expiresAt: string;
        tenantId: string;
        staff: PosSession['staff'];
    }>('/pos/auth/login', {
        method: 'POST',
        token: null,
        body: JSON.stringify({ pin, tenantId }),
    });
    setStoredToken(data.token);
    return data;
}

export async function logoutSession(): Promise<void> {
    try {
        await request('/pos/auth/logout', { method: 'POST' });
    } catch {
        /* ignore */
    }
    setStoredToken(null);
}

export async function fetchPosState(): Promise<{ state: PersistedState; revision: number }> {
    return request('/pos/state');
}

export async function pushPosState(
    state: PersistedState,
    expectedRevision: number | null,
): Promise<{ state: PersistedState; revision: number }> {
    return request('/pos/state', {
        method: 'PUT',
        body: JSON.stringify({
            state,
            expectedRevision: expectedRevision ?? undefined,
        }),
    });
}

export async function bootstrapPos(
    menu: PersistedState['menu'],
    tables: PersistedState['tables'],
): Promise<{ state: PersistedState; revision: number }> {
    return request('/pos/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ menu, tables }),
    });
}

export async function recordSale(sale: SaleRecord): Promise<SaleRecord> {
    const data = await request<{ sale: SaleRecord }>('/pos/sales', {
        method: 'POST',
        body: JSON.stringify({ sale }),
    });
    return data.sale;
}

export async function voidSaleRemote(saleId: string, reason: string): Promise<void> {
    await request(`/pos/sales/${encodeURIComponent(saleId)}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
    });
}

export async function postAuditRemote(entry: PersistedState['auditLog'][number]): Promise<void> {
    await request('/pos/audit', {
        method: 'POST',
        body: JSON.stringify({ entry }),
    });
}

export async function createCardIntent(input: {
    amountCents: number;
    currency?: string;
    tableLabel?: string;
    guestName?: string;
}): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    status: string;
}> {
    return request('/pos/payments/card-intent', {
        method: 'POST',
        body: JSON.stringify(input),
    });
}
