export type Money = string;

export interface ApiErrorBody {
  code?: string;
  message?: string;
}

export interface Tenant {
  id: string;
  master_account_id: string;
  legal_name: string;
  trade_name: string | null;
  country_code: string;
}

export interface MasterAccount {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/** Normalized desk context (API wire uses master_accounts / available_tenants). */
export interface ContextResponse {
  user_id: string;
  email: string;
  display_name: string;
  accounts: MasterAccount[];
  tenants: Tenant[];
  active_tenant: Tenant | null;
  active_account: MasterAccount | null;
  switched_at: string | null;
}

/** Raw `/api/v1/context` payload from FastAPI. */
export interface ContextWire {
  user_id: string;
  email: string;
  display_name: string;
  master_accounts: MasterAccount[];
  active_master_account: MasterAccount | null;
  active_tenant: Tenant | null;
  available_tenants: Tenant[];
  switched_at: string | null;
}

export interface IntakeReview {
  document_id: string;
  tenant_id: string;
  status: string;
  source_filename: string;
  vendor_name: string | null;
  invoice_date: string | null;
  tax_year: number | null;
  country_code: string | null;
  extracted_tot_amount: Money | null;
  table_tot_amount: Money | null;
  tot_rate: string | null;
  subtotal: Money | null;
  grand_total: Money | null;
  amounts_match: boolean | null;
  discrepancies: string[];
  ready_to_post: boolean;
  blocked_reason: string | null;
  post_path: string | null;
  invoice_id: string | null;
}

export interface IntakeReviewList {
  tenant_id: string;
  ready_count: number;
  blocked_count: number;
  reviews: IntakeReview[];
}

export interface UnfiledInvoice {
  invoice_id: string;
  vendor_name: string;
  invoice_date: string;
  tax_year: number;
  country_code: string;
  currency_code: string;
  subtotal: Money;
  tot_rate: string;
  tot_amount: Money;
  grand_total: Money;
  document_intake_id: string | null;
}

export interface OpenReturn {
  return_id: string;
  period_start: string;
  period_end: string;
  currency_code: string;
  due_on: string | null;
  tax_due: Money;
  amount_paid: Money;
  balance_due: Money;
  past_due: boolean;
  payment_path: string;
}

export interface DueActions {
  can_file_unfiled: boolean;
  file_unfiled_path: string | null;
  year_statement_path: string;
  open_returns: OpenReturn[];
}

export interface AnnualDue {
  tenant_id: string;
  country_code: string;
  tax_year: number;
  currency_code: string;
  summary_id: string;
  filed_tax_due: Money;
  filed_amount_paid: Money;
  filed_balance_due: Money;
  amount_due: Money;
  has_unfiled_gap: boolean;
  actions: DueActions;
}

export interface PeriodReadiness {
  tenant_id: string;
  tax_year: number;
  country_code: string;
  ready_count: number;
  blocked_count: number;
  unfiled_invoice_count: number;
  open_return_count: number;
  unfiled_tot_amount: Money;
  open_balance: Money;
  intakes_ready: IntakeReview[];
  intakes_blocked: IntakeReview[];
  unfiled_invoices: UnfiledInvoice[];
  open_returns: OpenReturn[];
  dues: AnnualDue | null;
}

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
