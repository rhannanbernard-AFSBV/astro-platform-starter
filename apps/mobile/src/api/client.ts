import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

function resolveApiUrl() {
  const fromExtra = extra?.apiUrl;
  // Ignore unresolved EAS template placeholders
  if (
    fromExtra &&
    !fromExtra.includes('REPLACE') &&
    !fromExtra.includes('YOUR_RAILWAY') &&
    !fromExtra.includes('${')
  ) {
    return fromExtra.replace(/\/$/, '');
  }
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (
    fromEnv &&
    !fromEnv.includes('REPLACE') &&
    !fromEnv.includes('YOUR_RAILWAY')
  ) {
    return fromEnv.replace(/\/$/, '');
  }
  return 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

function authHeaders(extraHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extraHeaders };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return headers;
}

export type AuthUser = {
  user_id: number;
  tenant_id: number;
  email: string;
  full_name: string;
  role: string;
  is_master?: boolean;
  home_tenant_id?: number;
};

export type FixtureRow = {
  fixture_type: string;
  count: number;
  labor_intensity?: string;
};

export type ScanResponse = {
  bid_id: number;
  proposal_id: number;
  client_name?: string;
  property_address?: string;
  pricing_committed?: boolean;
  spatial_summary: {
    total_cleanable_sq_ft: number;
    substrate_breakdown: { material: string; percentage: number }[];
    detected_fixtures: FixtureRow[];
  };
  financial_ledger: {
    recommended_shift_hours: number;
    calculated_labor_cost_per_shift: number;
    total_operational_cost_per_shift: number;
    recommended_monthly_invoice_price: number;
    formatted_monthly: string;
    formatted_per_shift: string;
    tot_rate: number;
    consumables_rate: number;
    labor_burden_multiplier: number;
    fixture_intensity_weighted?: number;
    density_factor?: number;
    dual_currency?: {
      currency_code: string;
      formatted_monthly: string;
      conversion_note: string;
    } | null;
    calculation_steps: {
      step: number;
      label: string;
      formula: string;
      result: number;
    }[];
    base_currency: { currency_code: string; currency_symbol: string };
  };
  proposal_copy: {
    executive_summary: string;
    detailed_scope_of_work: string;
  };
  crew_checklist: {
    sequence?: number;
    checklist_id?: number;
    room_zone: string;
    tasks: string[];
    is_high_risk?: boolean;
    ai_audit_prompt?: string | null;
  }[];
  meta: {
    extraction_source: string;
    jurisdiction_code: string;
    frame_count?: number;
    video_received?: boolean;
    pricing_committed?: boolean;
  };
  proposal: {
    status: string;
    email_html: string;
    proposal_text: string;
    /** Raw token intentionally omitted from scan JSON — use proposal_secure_url */
    proposal_secure_url?: string | null;
    access_token_expires_at?: string | null;
  };
  pdf_url?: string;
};

/** Extract portal token from /p/:token URL for in-app e-sign deep link */
export function portalTokenFromSecureUrl(url?: string | null): string | null {
  if (!url) return null;
  const m = String(url).match(/\/p\/([a-f0-9]+)/i);
  return m?.[1] || null;
}

export async function healthCheck() {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) throw new Error(`API health failed (${res.status})`);
  return res.json();
}

export async function login(email: string, password: string, tenantId?: string) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      tenant_id: tenantId ? Number(tenantId) : undefined,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Login failed (${res.status})`);
  return body as {
    token: string;
    user: AuthUser;
    tenant: { tenant_id: number; name: string };
  };
}

export async function register(input: {
  email: string;
  password: string;
  fullName: string;
  tenantId?: string;
  companyName?: string;
}) {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      full_name: input.fullName,
      tenant_id: input.tenantId ? Number(input.tenantId) : undefined,
      company_name: input.companyName,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Register failed (${res.status})`);
  return body as {
    token: string;
    user: AuthUser;
    tenant: { tenant_id: number; name: string };
  };
}

export async function fetchMe() {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Session invalid (${res.status})`);
  return res.json();
}

export async function createScan(input: {
  clientName: string;
  propertyAddress: string;
  frequency: string;
  hintSqFt?: string;
  imageUri?: string | null;
  imageUris?: string[];
  videoUri?: string | null;
  imageName?: string;
  imageType?: string;
  mock?: boolean;
  /** When true, skip calibrate gate (scripts). Mobile defaults to false. */
  commitPricing?: boolean;
}): Promise<ScanResponse> {
  const form = new FormData();
  form.append('client_name', input.clientName);
  form.append('property_address', input.propertyAddress);
  form.append('frequency', input.frequency);
  if (input.hintSqFt) form.append('hint_sq_ft', input.hintSqFt);
  if (input.commitPricing) form.append('commit_pricing', '1');

  const uris =
    input.imageUris?.length
      ? input.imageUris
      : input.imageUri
        ? [input.imageUri]
        : [];

  if (input.mock || (!uris.length && !input.videoUri)) form.append('mock', '1');

  if (!input.mock && uris.length) {
    uris.forEach((uri, i) => {
      const field = i === 0 && uris.length === 1 ? 'image' : 'images';
      form.append(field, {
        uri,
        name: input.imageName || `walkthrough-${i + 1}.jpg`,
        type: input.imageType || 'image/jpeg',
      } as unknown as Blob);
    });
  }
  if (!input.mock && input.videoUri) {
    form.append('video', {
      uri: input.videoUri,
      name: 'walkthrough.mp4',
      type: 'video/mp4',
    } as unknown as Blob);
  }

  const res = await fetch(`${API_URL}/api/scan`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Scan failed (${res.status})`);
  }
  return res.json();
}

export async function calibrateBid(
  bidId: number,
  input: {
    total_cleanable_sq_ft: number;
    detected_fixtures: FixtureRow[];
    substrate_breakdown?: { material: string; percentage: number }[];
  }
): Promise<ScanResponse> {
  const res = await fetch(`${API_URL}/api/bids/${bidId}/calibrate`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Calibrate failed (${res.status})`);
  return {
    ...body,
    bid_id: body.bid_id ?? bidId,
    pricing_committed: true,
  } as ScanResponse;
}

export async function requestProposalSignOtp(token: string, signerEmail: string) {
  const res = await fetch(`${API_URL}/api/public/proposals/${token}/request-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signer_email: signerEmail }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `OTP request failed (${res.status})`);
  return body as {
    status: string;
    sent_to?: string;
    expires_at?: string;
    transport?: string;
    dev_otp?: string;
    message?: string;
  };
}

export async function verifyProposalSignOtp(token: string, otp: string) {
  const res = await fetch(`${API_URL}/api/public/proposals/${token}/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `OTP verify failed (${res.status})`);
  return body as { status: string; sign_token: string; expires_at: string };
}

export async function sendProposal(
  bidId: number,
  toEmail: string,
  recipientName?: string
) {
  // Prefer /send alias (ops smoke scripts); fall back handled by same handler
  const res = await fetch(`${API_URL}/api/bids/${bidId}/send`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      to_email: toEmail,
      recipient_name: recipientName,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Send failed (${res.status})`);
  return body as {
    status: string;
    transport: string;
    proposal_secure_url: string;
    email_id: number;
  };
}

export async function signPublicProposal(
  token: string,
  input: {
    signerName: string;
    signerEmail?: string;
    typedSignature?: string;
    signatureDataUrl?: string;
    otp?: string;
    signToken?: string;
  }
) {
  const res = await fetch(`${API_URL}/api/public/proposals/${token}/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signer_name: input.signerName,
      signer_email: input.signerEmail,
      typed_signature: input.typedSignature,
      signature_data_url: input.signatureDataUrl,
      otp: input.otp,
      sign_token: input.signToken,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Sign failed (${res.status})`);
  return body;
}

export async function fetchBid(bidId: number) {
  const res = await fetch(`${API_URL}/api/bids/${bidId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Bid fetch failed (${res.status})`);
  return res.json();
}

export async function uploadQaPhoto(
  bidId: number,
  checklistId: number,
  imageUri: string,
  notes?: string
) {
  const form = new FormData();
  form.append('photo', {
    uri: imageUri,
    name: 'qa.jpg',
    type: 'image/jpeg',
  } as unknown as Blob);
  if (notes) form.append('notes', notes);
  const res = await fetch(
    `${API_URL}/api/bids/${bidId}/checklist/${checklistId}/qa-photo`,
    { method: 'POST', headers: authHeaders(), body: form }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `QA upload failed (${res.status})`);
  return body;
}

export async function fetchQaStatus(bidId: number) {
  const res = await fetch(`${API_URL}/api/bids/${bidId}/qa`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`QA status failed (${res.status})`);
  return res.json();
}

export async function setGeofence(
  bidId: number,
  input: { center_lat: number; center_lng: number; radius_m?: number; label?: string }
) {
  const res = await fetch(`${API_URL}/api/bids/${bidId}/geofence`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Geofence failed (${res.status})`);
  return body;
}

export async function logGps(
  bidId: number,
  input: {
    event_type: string;
    latitude: number;
    longitude: number;
    accuracy_m?: number;
    checklist_id?: number;
    notes?: string;
  }
) {
  const res = await fetch(`${API_URL}/api/bids/${bidId}/gps`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `GPS log failed (${res.status})`);
  return body;
}

export async function fetchAdminSettings() {
  const res = await fetch(`${API_URL}/api/admin/settings`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Admin settings failed (${res.status})`);
  return res.json();
}

export async function patchAdminSettings(body: Record<string, unknown>) {
  const res = await fetch(`${API_URL}/api/admin/settings`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Admin update failed (${res.status})`);
  return data;
}

export function proposalPdfUrl(bidId: number) {
  return `${API_URL}/api/bids/${bidId}/proposal.pdf`;
}

export async function fetchBidHistory() {
  const res = await fetch(`${API_URL}/api/history/bids`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`History failed (${res.status})`);
  return res.json();
}

export async function fetchAnalytics() {
  const res = await fetch(`${API_URL}/api/analytics/summary`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Analytics failed (${res.status})`);
  return res.json();
}

export async function setBidOutcome(
  bidId: number,
  outcome: string,
  extra?: {
    loss_reason?: string;
    loss_notes?: string;
    competitor_price?: number;
  }
) {
  const res = await fetch(`${API_URL}/api/bids/${bidId}/outcome`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ outcome, ...extra }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Outcome failed (${res.status})`);
  return body;
}

export async function setGeofenceFromAddress(
  bidId: number,
  input?: {
    address?: string;
    center_lat?: number;
    center_lng?: number;
    radius_m?: number;
    label?: string;
  }
) {
  const res = await fetch(`${API_URL}/api/bids/${bidId}/geofence/from-address`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(input || {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Geofence address failed (${res.status})`);
  return body;
}

export async function listTenants() {
  const res = await fetch(`${API_URL}/api/auth/tenants`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Tenants failed (${res.status})`);
  return res.json();
}

export async function switchTenant(tenantId: number) {
  const res = await fetch(`${API_URL}/api/auth/switch-tenant`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Switch failed (${res.status})`);
  return body as {
    token: string;
    user: AuthUser;
    tenant: { tenant_id: number; name: string };
  };
}

export async function registerPushToken(pushToken: string, platform = 'expo') {
  const res = await fetch(`${API_URL}/api/push/register`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ push_token: pushToken, platform }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Push register failed (${res.status})`);
  return body;
}

export async function offlineSync(
  bidId: number,
  events: Record<string, unknown>[],
  clientBatchId?: string
) {
  const res = await fetch(`${API_URL}/api/bids/${bidId}/offline-sync`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      client_batch_id: clientBatchId,
      events,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Offline sync failed (${res.status})`);
  return body;
}

export async function uploadCoi(uri: string, name = 'coi.pdf', type = 'application/pdf') {
  const form = new FormData();
  form.append('coi', { uri, name, type } as unknown as Blob);
  const res = await fetch(`${API_URL}/api/admin/insurance/coi`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `COI upload failed (${res.status})`);
  return body;
}
