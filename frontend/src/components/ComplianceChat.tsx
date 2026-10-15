"use client";

import { FormEvent, useState } from "react";

import { postComplianceChat } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useTenant } from "@/lib/tenant-context";
import { ApiError, type ComplianceChatResponse } from "@/lib/types";
import styles from "./panels.module.css";

const MONEY_KEYS = new Set([
  "gross_revenue",
  "tot_due",
  "net_revenue",
  "gross_monthly_salary",
  "szv_assessable_wage",
  "szv_aov_employer_contribution",
  "szv_aov_employee_deduction",
  "wage_tax_deduction",
  "net_take_home_pay",
]);

function isCalculation(
  res: ComplianceChatResponse,
): res is Extract<ComplianceChatResponse, { calculation_type: string }> {
  return "calculation_type" in res;
}

function displayField(key: string, value: string): string {
  if (MONEY_KEYS.has(key)) return formatMoney(value);
  return value;
}

export function ComplianceChat() {
  const { headers } = useTenant();
  const [prompt, setPrompt] = useState(
    "What is the TOT due on ANG 10,000 of taxable revenue?",
  );
  const [taxYear, setTaxYear] = useState(2026);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComplianceChatResponse | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await postComplianceChat(headers, {
        user_prompt: prompt.trim(),
        tax_year: taxYear,
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Chat request failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className={styles.formCard}
      onSubmit={onSubmit}
      aria-labelledby="compliance-chat-title"
    >
      <div className={styles.formHeader}>
        <h2 id="compliance-chat-title" className={styles.formTitle}>
          Compliance chat
        </h2>
        <p className={styles.formLead}>
          Routes intent to the SXM calculation engine. Tax math stays on the
          server — this panel only displays Decimal results.
        </p>
      </div>

      <label className={styles.label} htmlFor="chat-prompt">
        Prompt
      </label>
      <textarea
        id="chat-prompt"
        className={styles.textarea}
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        required
      />

      <label className={styles.label} htmlFor="chat-year">
        Tax year
      </label>
      <input
        id="chat-year"
        className={styles.input}
        type="number"
        min={2020}
        max={2100}
        value={taxYear}
        onChange={(e) => setTaxYear(Number.parseInt(e.target.value, 10) || 2026)}
      />

      <button className={styles.primaryBtn} type="submit" disabled={loading}>
        {loading ? "Asking…" : "Ask compliance API"}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {result && (
        <div className={styles.resultBlock} aria-live="polite">
          <p className={styles.resultSource}>{result.source}</p>
          {isCalculation(result) ? (
            <>
              <p className={styles.resultType}>
                Calculation · {result.calculation_type.replaceAll("_", " ")}
              </p>
              <dl className={styles.resultGrid}>
                {Object.entries(result.data).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>
                      <code>{displayField(key, String(value))}</code>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className={styles.resultMessage}>
              {result.message ?? "No message returned."}
            </p>
          )}
        </div>
      )}
    </form>
  );
}
