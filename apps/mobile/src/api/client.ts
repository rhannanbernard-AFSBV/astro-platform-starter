import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra as { apiUrl?: string } | undefined;

/** Local API — Android emulator uses 10.0.2.2; iOS simulator / web use localhost */
export const API_URL =
  extra?.apiUrl ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://localhost:4000';

const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID || '1';

export type ScanResponse = {
  bid_id: number;
  proposal_id: number;
  spatial_summary: {
    total_cleanable_sq_ft: number;
    substrate_breakdown: { material: string; percentage: number }[];
    detected_fixtures: { fixture_type: string; count: number }[];
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
    room_zone: string;
    tasks: string[];
    is_high_risk?: boolean;
    ai_audit_prompt?: string | null;
  }[];
  meta: { extraction_source: string; jurisdiction_code: string };
  proposal: {
    status: string;
    email_html: string;
    proposal_text: string;
  };
};

export async function healthCheck() {
  const res = await fetch(`${API_URL}/api/health`, {
    headers: { 'X-Tenant-Id': TENANT_ID },
  });
  if (!res.ok) throw new Error(`API health failed (${res.status})`);
  return res.json();
}

export async function createScan(input: {
  clientName: string;
  propertyAddress: string;
  frequency: string;
  hintSqFt?: string;
  imageUri?: string | null;
  imageName?: string;
  imageType?: string;
  mock?: boolean;
}): Promise<ScanResponse> {
  const form = new FormData();
  form.append('client_name', input.clientName);
  form.append('property_address', input.propertyAddress);
  form.append('frequency', input.frequency);
  if (input.hintSqFt) form.append('hint_sq_ft', input.hintSqFt);
  if (input.mock || !input.imageUri) form.append('mock', '1');

  if (input.imageUri && !input.mock) {
    form.append('image', {
      uri: input.imageUri,
      name: input.imageName || 'walkthrough.jpg',
      type: input.imageType || 'image/jpeg',
    } as unknown as Blob);
  }

  const res = await fetch(`${API_URL}/api/scan`, {
    method: 'POST',
    headers: { 'X-Tenant-Id': TENANT_ID },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Scan failed (${res.status})`);
  }
  return res.json();
}

export async function fetchBid(bidId: number) {
  const res = await fetch(`${API_URL}/api/bids/${bidId}`, {
    headers: { 'X-Tenant-Id': TENANT_ID },
  });
  if (!res.ok) throw new Error(`Bid fetch failed (${res.status})`);
  return res.json();
}
