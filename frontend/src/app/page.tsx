"use client";

import { FormEvent, useCallback, useState, useTransition } from "react";
import {
  ensureActiveTenant,
  fileUnfiled,
  getContext,
  getPeriodReadiness,
  listDocumentReviews,
  listDues,
  postIntakeInvoice,
  recordPayment,
  switchContext,
  uploadDocument,
} from "@/lib/api";
import type {
  AnnualDue,
  ContextResponse,
  IntakeReview,
  PeriodReadiness,
} from "@/lib/types";
import { ApiError } from "@/lib/types";

const STORAGE_KEY = "allyanna.compliance.apiKey";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ComplianceDeskPage() {
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window === "undefined") return "allyanna-dev-key";
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "allyanna-dev-key";
  });
  const [taxYear, setTaxYear] = useState(2026);
  const [countryCode, setCountryCode] = useState("SXM");
  const [context, setContext] = useState<ContextResponse | null>(null);
  const [reviews, setReviews] = useState<IntakeReview[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [period, setPeriod] = useState<PeriodReadiness | null>(null);
  const [dues, setDues] = useState<AnnualDue[]>([]);
  const [duesTotal, setDuesTotal] = useState("0.00");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const rememberKey = useCallback((key: string) => {
    setApiKey(key);
    window.sessionStorage.setItem(STORAGE_KEY, key);
  }, []);

  const refresh = useCallback(
    async (key: string) => {
      let ctx = await getContext(key);
      ctx = await ensureActiveTenant(key, ctx);
      setContext(ctx);
      if (!ctx.active_tenant) {
        setReviews([]);
        setReadyCount(0);
        setBlockedCount(0);
        setPeriod(null);
        setDues([]);
        setDuesTotal("0.00");
        return;
      }
      const [reviewList, readiness, dueList] = await Promise.all([
        listDocumentReviews(key),
        getPeriodReadiness(key, taxYear, countryCode),
        listDues(key),
      ]);
      setReviews(reviewList.reviews);
      setReadyCount(reviewList.ready_count);
      setBlockedCount(reviewList.blocked_count);
      setPeriod(readiness);
      setDues(dueList.dues);
      setDuesTotal(dueList.amount_due);
    },
    [countryCode, taxYear],
  );

  function run(label: string, work: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await work();
        setMessage(label);
      } catch (err) {
        const text =
          err instanceof ApiError
            ? `${err.code ?? "error"}: ${err.message}`
            : err instanceof Error
              ? err.message
              : "Request failed";
        setError(text);
      }
    });
  }

  function onConnect(event: FormEvent) {
    event.preventDefault();
    const key = apiKey.trim();
    rememberKey(key);
    run("Connected to Allyanna API", async () => {
      await refresh(key);
    });
  }

  function onSwitchTenant(tenantId: string) {
    run("Switched business profile", async () => {
      await switchContext(apiKey, tenantId);
      await refresh(apiKey);
    });
  }

  function onPost(review: IntakeReview) {
    if (!review.post_path) return;
    run(`Posted ${review.source_filename}`, async () => {
      await postIntakeInvoice(apiKey, review.post_path!);
      await refresh(apiKey);
    });
  }

  function onUpload(file: File | null) {
    if (!file) return;
    run(`Uploaded ${file.name}`, async () => {
      await uploadDocument(apiKey, file);
      await refresh(apiKey);
    });
  }

  function onFileUnfiled(path: string) {
    run("Filed unfiled annual-summary gap", async () => {
      await fileUnfiled(apiKey, path);
      await refresh(apiKey);
    });
  }

  function onPay(path: string, returnId: string) {
    const amount = (payAmount[returnId] ?? "").trim();
    if (!amount) {
      setError("Enter a payment amount as a decimal string");
      return;
    }
    run(`Recorded payment on ${returnId.slice(0, 8)}…`, async () => {
      await recordPayment(apiKey, path, amount, todayIso());
      await refresh(apiKey);
    });
  }

  const activeName =
    context?.active_tenant?.trade_name ||
    context?.active_tenant?.legal_name ||
    "No active profile";

  return (
    <main>
      <p className="muted" style={{ margin: 0, letterSpacing: "0.04em" }}>
        SINT MAARTEN · TURNOVER TAX DESK
      </p>
      <h1 className="brand">Allyanna</h1>
      <p className="lede">
        Review OCR intakes, post table-priced invoices, then act on what is still
        due to the Sint Maarten Tax Office. The browser never calculates tax.
      </p>

      <section className="panel">
        <h2>1. Connect</h2>
        <p className="hint">
          Use a Bearer API key and switch the active business profile. Demo seed
          key: <code>allyanna-dev-key</code>.
        </p>
        <form className="row" onSubmit={onConnect}>
          <label>
            API key
            <input
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Tax year
            <input
              type="number"
              value={taxYear}
              onChange={(event) => setTaxYear(Number(event.target.value))}
              min={2000}
              max={2100}
            />
          </label>
          <label>
            Country
            <input
              value={countryCode}
              onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
              maxLength={3}
            />
          </label>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Working…" : "Load desk"}
          </button>
        </form>
        {context ? (
          <div className="stack" style={{ marginTop: "1rem" }}>
            <p className="muted">
              Active profile: <strong>{activeName}</strong>
              {context.active_account
                ? ` · ${context.active_account.name}`
                : null}
            </p>
            <div className="row">
              {context.tenants.map((tenant) => (
                <button
                  key={tenant.id}
                  type="button"
                  className="btn secondary"
                  disabled={pending || context.active_tenant?.id === tenant.id}
                  onClick={() => onSwitchTenant(tenant.id)}
                >
                  {tenant.trade_name || tenant.legal_name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? <p className="muted">{message}</p> : null}

      {context ? (
        <>
          <section className="panel">
            <h2>2. OCR review</h2>
            <p className="hint">
              Ready rows match the tax table and can be posted. Mismatches stay
              blocked until reviewed. Upload stays async.
            </p>
            <div className="stats">
              <div className="stat">
                <strong>{readyCount}</strong>
                <span className="muted">ready to post</span>
              </div>
              <div className="stat">
                <strong>{blockedCount}</strong>
                <span className="muted">blocked</span>
              </div>
            </div>
            <div className="row" style={{ marginBottom: "1rem" }}>
              <label>
                Upload receipt
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => onUpload(event.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="button"
                className="btn secondary"
                disabled={pending}
                onClick={() =>
                  run("Refreshed review queue", async () => {
                    await refresh(apiKey);
                  })
                }
              >
                Refresh
              </button>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Vendor / date</th>
                  <th>Printed vs table TOT</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No intakes for this profile yet.
                    </td>
                  </tr>
                ) : (
                  reviews.map((row) => (
                    <tr key={row.document_id}>
                      <td>{row.source_filename}</td>
                      <td>
                        {row.vendor_name ?? "—"}
                        <br />
                        <span className="muted">{row.invoice_date ?? "—"}</span>
                      </td>
                      <td>
                        {row.extracted_tot_amount ?? "—"} /{" "}
                        {row.table_tot_amount ?? "—"}
                        {row.discrepancies.length ? (
                          <>
                            <br />
                            <span className="muted">
                              {row.discrepancies[0]}
                            </span>
                          </>
                        ) : null}
                      </td>
                      <td>
                        {row.ready_to_post ? (
                          <span className="badge ready">ready</span>
                        ) : (
                          <span className="badge blocked">
                            {row.blocked_reason ?? row.status}
                          </span>
                        )}
                      </td>
                      <td>
                        {row.ready_to_post && row.post_path ? (
                          <button
                            type="button"
                            className="btn"
                            disabled={pending}
                            onClick={() => onPost(row)}
                          >
                            Post invoice
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>3. Period readiness</h2>
            <p className="hint">
              What still needs posting, filing, or paying for {taxYear}{" "}
              {countryCode}.
            </p>
            {period ? (
              <>
                <div className="stats">
                  <div className="stat">
                    <strong>{period.ready_count}</strong>
                    <span className="muted">intakes ready</span>
                  </div>
                  <div className="stat">
                    <strong>{period.unfiled_invoice_count}</strong>
                    <span className="muted">unfiled invoices</span>
                  </div>
                  <div className="stat">
                    <strong>{period.unfiled_tot_amount}</strong>
                    <span className="muted">unfiled TOT</span>
                  </div>
                  <div className="stat">
                    <strong>{period.open_balance}</strong>
                    <span className="muted">open return balance</span>
                  </div>
                </div>
                <h3 style={{ fontSize: "1rem" }}>Unfiled invoices</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Date</th>
                      <th>Subtotal</th>
                      <th>TOT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.unfiled_invoices.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          No posted invoices waiting on a return for this year.
                        </td>
                      </tr>
                    ) : (
                      period.unfiled_invoices.map((row) => (
                        <tr key={row.invoice_id}>
                          <td>{row.vendor_name}</td>
                          <td>{row.invoice_date}</td>
                          <td>{row.subtotal}</td>
                          <td>{row.tot_amount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <h3 style={{ fontSize: "1rem" }}>Open returns</h3>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Balance</th>
                      <th>Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {period.open_returns.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="muted">
                          No open filed returns for this year.
                        </td>
                      </tr>
                    ) : (
                      period.open_returns.map((row) => (
                        <tr key={row.return_id}>
                          <td>
                            {row.period_start} → {row.period_end}
                            {row.past_due ? (
                              <>
                                <br />
                                <span className="badge blocked">past due</span>
                              </>
                            ) : null}
                          </td>
                          <td>{row.balance_due}</td>
                          <td>
                            <div className="row">
                              <input
                                placeholder="0.00"
                                value={payAmount[row.return_id] ?? ""}
                                onChange={(event) =>
                                  setPayAmount((prev) => ({
                                    ...prev,
                                    [row.return_id]: event.target.value,
                                  }))
                                }
                              />
                              <button
                                type="button"
                                className="btn"
                                disabled={pending}
                                onClick={() =>
                                  onPay(row.payment_path, row.return_id)
                                }
                              >
                                Pay
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="muted">Load the desk to see period readiness.</p>
            )}
          </section>

          <section className="panel">
            <h2>4. Dues actions</h2>
            <p className="hint">
              Pay-due reminders with file-unfiled and payment paths. Amount due
              total: <strong>{duesTotal}</strong>
            </p>
            {dues.length === 0 ? (
              <p className="muted">No annual summaries with dues yet.</p>
            ) : (
              dues.map((due) => (
                <div key={due.summary_id} className="stack" style={{ marginBottom: "1.25rem" }}>
                  <p>
                    <strong>
                      {due.tax_year} {due.country_code}
                    </strong>{" "}
                    · amount due {due.amount_due}
                    {due.has_unfiled_gap ? " · unfiled gap" : ""}
                  </p>
                  <p className="muted">
                    Year statement path: <code>{due.actions.year_statement_path}</code>
                  </p>
                  <div className="row">
                    {due.actions.can_file_unfiled && due.actions.file_unfiled_path ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={pending}
                        onClick={() => onFileUnfiled(due.actions.file_unfiled_path!)}
                      >
                        File unfiled gap
                      </button>
                    ) : null}
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Return period</th>
                        <th>Balance</th>
                        <th>Pay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {due.actions.open_returns.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="muted">
                            No open returns for this year.
                          </td>
                        </tr>
                      ) : (
                        due.actions.open_returns.map((row) => (
                          <tr key={row.return_id}>
                            <td>
                              {row.period_start} → {row.period_end}
                              {row.past_due ? (
                                <>
                                  <br />
                                  <span className="badge blocked">past due</span>
                                </>
                              ) : null}
                            </td>
                            <td>{row.balance_due}</td>
                            <td>
                              <div className="row">
                                <input
                                  placeholder="0.00"
                                  value={payAmount[row.return_id] ?? ""}
                                  onChange={(event) =>
                                    setPayAmount((prev) => ({
                                      ...prev,
                                      [row.return_id]: event.target.value,
                                    }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={pending}
                                  onClick={() =>
                                    onPay(row.payment_path, row.return_id)
                                  }
                                >
                                  Pay
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
