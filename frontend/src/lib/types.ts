/**
 * API shapes aligned with Allyanna FastAPI backend (PRs #2–#5).
 * Money fields are string-encoded Decimals — never use JS number arithmetic.
 */

export type DecimalString = string;

export type TenantRole = "owner" | "employee" | "external_accountant";

export interface BusinessProfile {
  id: string;
  name: string;
  /** Stub user id sent as X-User-Id for chat/OCR tenant context. */
  userId: string;
  role: TenantRole;
  kind: "master" | "business";
}

export interface ChatQueryRequest {
  user_prompt: string;
  tax_year?: number;
}

export interface TotCalculationData {
  gross_revenue: DecimalString;
  tot_rate: DecimalString;
  tot_due: DecimalString;
  net_revenue: DecimalString;
}

export interface WageTaxSzvData {
  gross_monthly_salary: DecimalString;
  szv_assessable_wage: DecimalString;
  szv_aov_employer_contribution: DecimalString;
  szv_aov_employee_deduction: DecimalString;
  wage_tax_deduction: DecimalString;
  net_take_home_pay: DecimalString;
}

export interface ComplianceCalculationResponse {
  tenant_id: string;
  source: "Hardcoded Calculation Engine";
  calculation_type: "tot" | "wage_tax_szv";
  data: TotCalculationData | WageTaxSzvData;
}

export interface ComplianceConversationResponse {
  tenant_id: string;
  source: "AI Conversational Engine";
  message: string | null;
}

export type ComplianceChatResponse =
  | ComplianceCalculationResponse
  | ComplianceConversationResponse;

export interface MonthlyPayrollRunRequest {
  employee_name: string;
  /** Decimal string — backend coerces via str; do not send JS floats. */
  gross_salary: DecimalString;
  tax_year?: number;
}

export interface MonthlyPayrollRunResponse {
  status: string;
  message: string;
  payroll_record_id: string;
  tenant_id: string;
  calculations: WageTaxSzvData;
}

export interface OcrRequest {
  file_url: string;
}

export interface ReceiptExtractionResponse {
  vendor_name: string;
  invoice_date: string;
  subtotal: DecimalString;
  tot_amount: DecimalString;
  grand_total: DecimalString;
}

export interface OcrJobResponse {
  tenant_id: string;
  status: "extracted" | "accepted";
  extraction: ReceiptExtractionResponse | null;
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}
