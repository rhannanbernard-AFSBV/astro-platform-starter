import { isServerMode } from './posApi';

/**
 * Production boot policy:
 * - Local/dev may run without PUBLIC_POS_API_URL (demo localStorage).
 * - Production builds MUST set PUBLIC_POS_API_URL so plaintext demo PINs
 *   are never used on a live domain.
 */
export function isProductionRuntime(): boolean {
    try {
        return Boolean((import.meta as ImportMeta & { env?: { PROD?: boolean } }).env?.PROD);
    } catch {
        return false;
    }
}

export function allowLocalDemoMode(): boolean {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | boolean> }).env;
    if (env?.PUBLIC_POS_ALLOW_LOCAL_DEMO === '1' || env?.PUBLIC_POS_ALLOW_LOCAL_DEMO === 'true') {
        return true;
    }
    return !isProductionRuntime();
}

export type BootGuardResult =
    | { ok: true; mode: 'server' | 'local-demo' }
    | { ok: false; reason: 'missing_api_url'; message: string };

export function evaluateBootGuard(): BootGuardResult {
    if (isServerMode()) {
        return { ok: true, mode: 'server' };
    }
    if (allowLocalDemoMode()) {
        return { ok: true, mode: 'local-demo' };
    }
    return {
        ok: false,
        reason: 'missing_api_url',
        message:
            'Production POS requires PUBLIC_POS_API_URL. Local demo PINs are blocked on live builds. Set the API URL (or PUBLIC_POS_ALLOW_LOCAL_DEMO=1 for an explicit exception).',
    };
}
