/**
 * Address geocoding via Nominatim (OpenStreetMap) with resilient failure modes.
 *
 * Hosted environments (Railway, etc.) must allow outbound HTTPS to the geocoder host.
 * Configure NOMINATIM_URL if using a self-hosted / commercial Nominatim mirror.
 *
 * Allowlist tip: permit `nominatim.openstreetmap.org` (or your NOMINATIM_URL host)
 * on the platform egress firewall. If blocked, clients should pass center_lat/center_lng.
 */

const DEFAULT_NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export function nominatimEndpoint() {
  const raw = (process.env.NOMINATIM_URL || DEFAULT_NOMINATIM).trim();
  try {
    const u = new URL(raw);
    // Accept base host or full /search path
    if (!u.pathname || u.pathname === '/') {
      u.pathname = '/search';
    }
    return u;
  } catch {
    return new URL(DEFAULT_NOMINATIM);
  }
}

export function nominatimHostAllowlist() {
  const raw = process.env.NOMINATIM_ALLOWLIST?.trim();
  if (!raw) {
    // Default: only the configured endpoint host
    return [nominatimEndpoint().hostname];
  }
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {string} address
 * @returns {Promise<{ lat: number, lon: number, display_name: string, source: string }>}
 */
export async function geocodeAddress(address) {
  const q = String(address || '').trim();
  if (!q) {
    throw Object.assign(new Error('address required'), {
      status: 400,
      code: 'GEOCODE_ADDRESS_REQUIRED',
    });
  }

  const endpoint = nominatimEndpoint();
  const allowed = nominatimHostAllowlist();
  if (!allowed.includes(endpoint.hostname.toLowerCase())) {
    throw Object.assign(
      new Error(
        `Geocoder host ${endpoint.hostname} is not in NOMINATIM_ALLOWLIST — set allowlist or use manual center_lat/center_lng`
      ),
      { status: 503, code: 'GEOCODER_HOST_BLOCKED' }
    );
  }

  endpoint.searchParams.set('q', q);
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('limit', '1');

  const timeoutMs = Math.max(
    1000,
    Number(process.env.NOMINATIM_TIMEOUT_MS || 8000)
  );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const geoRes = await fetch(endpoint, {
      headers: {
        'User-Agent':
          process.env.NOMINATIM_USER_AGENT?.trim() ||
          'OmniCleanAIScanner/0.1 (ops geofence; contact ops)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (geoRes.status === 403 || geoRes.status === 401) {
      throw Object.assign(
        new Error(
          `Geocoder refused access (HTTP ${geoRes.status}) — allowlist egress to ${endpoint.hostname} or set center_lat/center_lng manually`
        ),
        { status: 503, code: 'GEOCODER_EGRESS_BLOCKED' }
      );
    }
    if (!geoRes.ok) {
      throw Object.assign(
        new Error(`Geocoder HTTP ${geoRes.status}`),
        { status: 502, code: 'GEOCODER_FAILED' }
      );
    }

    const hits = await geoRes.json();
    if (!Array.isArray(hits) || !hits.length) {
      throw Object.assign(
        new Error(
          'No geocode result for address — set center_lat/center_lng manually'
        ),
        { status: 404, code: 'GEOCODE_NOT_FOUND' }
      );
    }

    return {
      lat: Number(hits[0].lat),
      lon: Number(hits[0].lon),
      display_name: hits[0].display_name,
      source: 'nominatim',
    };
  } catch (err) {
    if (err.code && err.status) throw err;
    if (err.name === 'AbortError') {
      throw Object.assign(
        new Error(
          `Geocoder timed out after ${timeoutMs}ms — check egress to ${endpoint.hostname} or pin manually`
        ),
        { status: 504, code: 'GEOCODER_TIMEOUT' }
      );
    }
    // DNS / network / TLS failures often mean egress blocked
    const msg = err.message || String(err);
    const blocked =
      /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|certificate|fetch failed/i.test(
        msg
      );
    throw Object.assign(
      new Error(
        blocked
          ? `Geocoder unreachable (${msg}) — allow HTTPS egress to ${endpoint.hostname} (Nominatim) or pass center_lat/center_lng`
          : `Geocoder error: ${msg}`
      ),
      {
        status: blocked ? 503 : 502,
        code: blocked ? 'GEOCODER_EGRESS_BLOCKED' : 'GEOCODER_FAILED',
        cause: err,
      }
    );
  } finally {
    clearTimeout(timer);
  }
}
