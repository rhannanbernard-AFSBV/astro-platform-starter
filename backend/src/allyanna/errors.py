"""Application errors mapped to HTTP responses by the API layer."""


class AllyannaError(Exception):
    code = "error"
    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class Unauthenticated(AllyannaError):
    code = "unauthenticated"
    status_code = 401


class TenantAccessDenied(AllyannaError):
    code = "tenant_access_denied"
    status_code = 403


class TenantInactive(AllyannaError):
    code = "tenant_inactive"
    status_code = 403


class TenantContextRequired(AllyannaError):
    code = "tenant_context_required"
    status_code = 409


class TaxTableNotFound(AllyannaError):
    code = "tax_table_not_found"
    status_code = 404


class InvalidTaxTable(AllyannaError):
    code = "invalid_tax_table"
    status_code = 500


class InvalidMoney(AllyannaError):
    code = "invalid_money"
    status_code = 422


class InvalidOvRate(AllyannaError):
    code = "invalid_ov_rate"
    status_code = 422


class InvalidDocument(AllyannaError):
    code = "invalid_document"
    status_code = 422


class DocumentNotFound(AllyannaError):
    code = "document_not_found"
    status_code = 404


class ExtractionFailed(AllyannaError):
    code = "extraction_failed"
    status_code = 422


class InvalidInvoice(AllyannaError):
    code = "invalid_invoice"
    status_code = 422


class InvoiceNotFound(AllyannaError):
    code = "invoice_not_found"
    status_code = 404


class DuplicateInvoiceNumber(AllyannaError):
    code = "duplicate_invoice_number"
    status_code = 409


class InvoicePeriodFiled(AllyannaError):
    code = "invoice_period_filed"
    status_code = 409


class CorrectingInvoiceExists(AllyannaError):
    code = "correcting_invoice_exists"
    status_code = 409


class IntakeAlreadyPosted(AllyannaError):
    code = "intake_already_posted"
    status_code = 409


class InvalidWorksheet(AllyannaError):
    code = "invalid_worksheet"
    status_code = 422


class TotReturnNotFound(AllyannaError):
    code = "tot_return_not_found"
    status_code = 404


class TotReturnAlreadyFiled(AllyannaError):
    code = "tot_return_already_filed"
    status_code = 409


class TotReturnSuperseded(AllyannaError):
    code = "tot_return_superseded"
    status_code = 409


class InvalidPayment(AllyannaError):
    code = "invalid_payment"
    status_code = 422


class TotPaymentNotFound(AllyannaError):
    code = "tot_payment_not_found"
    status_code = 404


class TotRefundNotFound(AllyannaError):
    code = "tot_refund_not_found"
    status_code = 404


class TotAnnualSummaryNotFound(AllyannaError):
    code = "tot_annual_summary_not_found"
    status_code = 404


class TotAnnualSummaryAlreadyFiled(AllyannaError):
    code = "tot_annual_summary_already_filed"
    status_code = 409


class TotAnnualSummarySuperseded(AllyannaError):
    code = "tot_annual_summary_superseded"
    status_code = 409


class ServiceUnavailable(AllyannaError):
    code = "service_unavailable"
    status_code = 503
