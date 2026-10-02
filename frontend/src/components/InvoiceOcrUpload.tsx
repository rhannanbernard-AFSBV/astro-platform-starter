"use client";

import { FormEvent, useState } from "react";

import { postOcrReceipt } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useTenant } from "@/lib/tenant-context";
import { ApiError, type OcrJobResponse } from "@/lib/types";
import styles from "./panels.module.css";

export function InvoiceOcrUpload() {
  const { headers } = useTenant();
  const [fileUrl, setFileUrl] = useState(
    "https://example.com/receipts/sample-sxm-invoice.jpg",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stubNote, setStubNote] = useState<string | null>(null);
  const [result, setResult] = useState<OcrJobResponse | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setStubNote(null);
    setResult(null);

    const body = { file_url: fileUrl.trim() };

    try {
      const res = await postOcrReceipt(headers, body);
      setResult(res);
    } catch (err) {
      // Route may be absent until compliance-core lands — keep same request shape.
      if (err instanceof ApiError && err.status !== 404 && err.status < 500) {
        setError(err.message);
      } else {
        const status = err instanceof ApiError ? err.status : 0;
        const stub: OcrJobResponse = {
          tenant_id: headers.tenantId,
          status: "accepted",
          extraction: null,
        };
        setResult(stub);
        setStubNote(
          status === 404
            ? "Backend OCR route not available yet (404). Request used the same OcrRequest shape: { file_url }. Showing accepted stub."
            : `Could not reach OCR endpoint (${status || "network"}). Request shape preserved as { file_url }. Showing accepted stub.`,
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className={styles.formCard}
      onSubmit={onSubmit}
      aria-labelledby="ocr-upload-title"
    >
      <div className={styles.formHeader}>
        <h2 id="ocr-upload-title" className={styles.formTitle}>
          Invoice / OCR intake
        </h2>
        <p className={styles.formLead}>
          Async extraction via{" "}
          <code>POST /api/v1/ocr/receipts</code>. LLM extracts fields only —
          never recalculates TOT in the browser.
        </p>
      </div>

      <label className={styles.label} htmlFor="file-url">
        Receipt / invoice file URL
      </label>
      <input
        id="file-url"
        className={styles.input}
        type="url"
        value={fileUrl}
        onChange={(e) => setFileUrl(e.target.value)}
        required
      />

      <button className={styles.primaryBtn} type="submit" disabled={loading}>
        {loading ? "Submitting…" : "Submit for extraction"}
      </button>

      {error && <p className={styles.error}>{error}</p>}
      {stubNote && <p className={styles.stubNote}>{stubNote}</p>}

      {result && (
        <div className={styles.resultBlock} aria-live="polite">
          <p className={styles.resultSource}>
            Status · {result.status} · tenant {result.tenant_id}
          </p>
          {result.extraction ? (
            <dl className={styles.resultGrid}>
              <div>
                <dt>vendor name</dt>
                <dd>{result.extraction.vendor_name}</dd>
              </div>
              <div>
                <dt>invoice date</dt>
                <dd>{result.extraction.invoice_date}</dd>
              </div>
              <div>
                <dt>subtotal</dt>
                <dd>
                  <code>{formatMoney(result.extraction.subtotal)}</code>
                </dd>
              </div>
              <div>
                <dt>tot amount</dt>
                <dd>
                  <code>{formatMoney(result.extraction.tot_amount)}</code>
                </dd>
              </div>
              <div>
                <dt>grand total</dt>
                <dd>
                  <code>{formatMoney(result.extraction.grand_total)}</code>
                </dd>
              </div>
            </dl>
          ) : (
            <p className={styles.resultMessage}>
              Job accepted. Extraction payload will appear when the async OCR
              pipeline returns structured fields.
            </p>
          )}
        </div>
      )}
    </form>
  );
}
