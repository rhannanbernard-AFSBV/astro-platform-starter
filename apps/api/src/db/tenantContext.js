import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request tenant / RLS context.
 * Authenticated routes set tenantId from JWT; boot/login/public portal use bypass.
 */
const storage = new AsyncLocalStorage();

/**
 * @returns {{ tenantId?: number, userId?: number, bypass?: boolean } | undefined}
 */
export function getTenantContext() {
  return storage.getStore();
}

/**
 * @param {{ tenantId?: number, userId?: number, bypass?: boolean }} ctx
 * @param {() => unknown} fn
 */
export function runWithTenantContext(ctx, fn) {
  return storage.run({ ...ctx }, fn);
}

/**
 * Run fn with RLS bypass (migrations, login, public portal token lookups).
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withRlsBypass(fn) {
  const parent = getTenantContext() || {};
  return storage.run({ ...parent, bypass: true }, fn);
}

/**
 * Whether the process is treated as production for demo-seed / security gates.
 */
export function isProductionEnv() {
  const omni = String(process.env.OMNI_ENV || '').toLowerCase();
  const node = String(process.env.NODE_ENV || '').toLowerCase();
  return omni === 'production' || node === 'production';
}

/** Demo credentials / master graph may seed only when not production (or ALLOW_DEMO_SEED). */
export function allowDemoSeed() {
  if (process.env.ALLOW_DEMO_SEED === 'true') return true;
  if (process.env.ALLOW_DEMO_SEED === 'false') return false;
  return !isProductionEnv();
}
