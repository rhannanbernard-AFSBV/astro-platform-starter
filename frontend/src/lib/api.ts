/**
 * Shared Allyanna API client.
 * Always sends X-Tenant-ID. Never computes tax in the browser.
 */

import type {
  ChatQueryRequest,
  ComplianceChatResponse,
  MonthlyPayrollRunRequest,
  MonthlyPayrollRunResponse,
  OcrJobResponse,
  OcrRequest,
} from "./types";
import { ApiError } from "./types";

const DEFAULT_BASE = "http://localhost:8000";

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  return (raw && raw.length > 0 ? raw : DEFAULT_BASE).replace(/\/$/, "");
}

export interface TenantHeaders {
  tenantId: string;
  userId: string;
  role: string;
}

function buildHeaders(
  tenant: TenantHeaders,
  init?: HeadersInit,
): Headers {
  const headers = new Headers(init);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  // Case-insensitive on the wire; payroll routes document X-Tenant-ID.
  headers.set("X-Tenant-ID", tenant.tenantId);
  headers.set("X-User-Id", tenant.userId);
  headers.set("X-Role", tenant.role);
  return headers;
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  const detail =
    typeof body === "object" &&
    body !== null &&
    "detail" in body &&
    typeof (body as { detail: unknown }).detail === "string"
      ? (body as { detail: string }).detail
      : `Request failed (${res.status})`;
  return new ApiError(detail, res.status, body);
}

async function request<T>(
  path: string,
  tenant: TenantHeaders,
  init?: RequestInit,
): Promise<T> {
  const url = `${getApiBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: buildHeaders(tenant, init?.headers),
  });
  if (!res.ok) {
    throw await parseError(res);
  }
  return (await res.json()) as T;
}

/** POST /api/v1/chat/compliance */
export function postComplianceChat(
  tenant: TenantHeaders,
  body: ChatQueryRequest,
): Promise<ComplianceChatResponse> {
  return request<ComplianceChatResponse>("/api/v1/chat/compliance", tenant, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** POST /api/v1/payroll/process-monthly-run */
export function postMonthlyPayrollRun(
  tenant: TenantHeaders,
  body: MonthlyPayrollRunRequest,
): Promise<MonthlyPayrollRunResponse> {
  return request<MonthlyPayrollRunResponse>(
    "/api/v1/payroll/process-monthly-run",
    tenant,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

/**
 * POST /api/v1/ocr/receipts — from compliance-core PR #2.
 * Callers should catch ApiError (e.g. 404) and surface stub messaging.
 */
export function postOcrReceipt(
  tenant: TenantHeaders,
  body: OcrRequest,
): Promise<OcrJobResponse> {
  return request<OcrJobResponse>("/api/v1/ocr/receipts", tenant, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
