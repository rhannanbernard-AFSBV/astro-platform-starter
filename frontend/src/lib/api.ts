/**
 * Allyanna API client. Bearer auth. Never compute tax in the browser.
 */

import type {
  AnnualDue,
  ApiErrorBody,
  ContextResponse,
  IntakeReviewList,
  PeriodReadiness,
} from "./types";
import { ApiError } from "./types";

const DEFAULT_BASE = "http://127.0.0.1:8000";

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : DEFAULT_BASE).replace(/\/$/, "");
}

async function parseError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  return new ApiError(
    body?.message ?? `Request failed (${res.status})`,
    res.status,
    body?.code ?? null,
  );
}

async function request<T>(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });
  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function getContext(apiKey: string): Promise<ContextResponse> {
  return request<ContextResponse>("/api/v1/context", apiKey);
}

export function switchContext(
  apiKey: string,
  tenantId: string,
): Promise<ContextResponse> {
  return request<ContextResponse>("/api/v1/context/switch", apiKey, {
    method: "POST",
    body: JSON.stringify({ tenant_id: tenantId }),
  });
}

export function listDocumentReviews(apiKey: string): Promise<IntakeReviewList> {
  return request<IntakeReviewList>("/api/v1/documents/review", apiKey);
}

export function postIntakeInvoice(
  apiKey: string,
  postPath: string,
): Promise<{ id: string; tot_amount: string; subtotal: string }> {
  return request(postPath, apiKey, { method: "POST" });
}

export function getPeriodReadiness(
  apiKey: string,
  taxYear: number,
  countryCode: string,
): Promise<PeriodReadiness> {
  const params = new URLSearchParams({
    tax_year: String(taxYear),
    country_code: countryCode,
  });
  return request<PeriodReadiness>(`/api/v1/tax/tot/period-ready?${params}`, apiKey);
}

export function listDues(apiKey: string): Promise<{
  tenant_id: string;
  amount_due: string;
  unfiled_count: number;
  dues: AnnualDue[];
}> {
  return request("/api/v1/tax/tot/dues", apiKey);
}

export function fileUnfiled(
  apiKey: string,
  fileUnfiledPath: string,
): Promise<{ id: string; tax_year: number; balance_due: string }> {
  return request(fileUnfiledPath, apiKey, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function recordPayment(
  apiKey: string,
  paymentPath: string,
  amount: string,
  paidOn: string,
): Promise<{ id: string; balance_due: string; amount_paid: string }> {
  return request(paymentPath, apiKey, {
    method: "POST",
    body: JSON.stringify({ amount, paid_on: paidOn }),
  });
}

export function uploadDocument(
  apiKey: string,
  file: File,
): Promise<{ id: string; status: string }> {
  const body = new FormData();
  body.append("file", file);
  return request("/api/v1/documents", apiKey, { method: "POST", body });
}
