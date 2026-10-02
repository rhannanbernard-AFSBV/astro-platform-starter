"use client";

import { FormEvent, useState } from "react";

import { postMonthlyPayrollRun } from "@/lib/api";
import { formatMoney, sanitizeDecimalInput } from "@/lib/money";
import { useTenant } from "@/lib/tenant-context";
import { ApiError, type MonthlyPayrollRunResponse } from "@/lib/types";
import styles from "./panels.module.css";

export function PayrollRunForm() {
  const { headers } = useTenant();
  const [employeeName, setEmployeeName] = useState("Marisol Jansen");
  const [grossSalary, setGrossSalary] = useState("4500.00");
  const [taxYear, setTaxYear] = useState(2026);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MonthlyPayrollRunResponse | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await postMonthlyPayrollRun(headers, {
        employee_name: employeeName.trim(),
        gross_salary: grossSalary,
        tax_year: taxYear,
      });
      setResult(res);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Payroll run failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      className={styles.formCard}
      onSubmit={onSubmit}
      aria-labelledby="payroll-run-title"
    >
      <div className={styles.formHeader}>
        <h2 id="payroll-run-title" className={styles.formTitle}>
          Monthly payroll run
        </h2>
        <p className={styles.formLead}>
          Submits to{" "}
          <code>POST /api/v1/payroll/process-monthly-run</code>. Wage tax and
          SZV are computed with Python Decimal on the backend.
        </p>
      </div>

      <label className={styles.label} htmlFor="employee-name">
        Employee name
      </label>
      <input
        id="employee-name"
        className={styles.input}
        value={employeeName}
        onChange={(e) => setEmployeeName(e.target.value)}
        required
        minLength={1}
      />

      <label className={styles.label} htmlFor="gross-salary">
        Gross monthly salary (ANG)
      </label>
      <input
        id="gross-salary"
        className={styles.input}
        inputMode="decimal"
        value={grossSalary}
        onChange={(e) => setGrossSalary(sanitizeDecimalInput(e.target.value))}
        required
        pattern="^\d+(\.\d{1,2})?$"
      />

      <label className={styles.label} htmlFor="payroll-year">
        Tax year
      </label>
      <input
        id="payroll-year"
        className={styles.input}
        type="number"
        min={2020}
        max={2100}
        value={taxYear}
        onChange={(e) => setTaxYear(Number.parseInt(e.target.value, 10) || 2026)}
      />

      <button className={styles.primaryBtn} type="submit" disabled={loading}>
        {loading ? "Processing…" : "Process monthly run"}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {result && (
        <div className={styles.resultBlock} aria-live="polite">
          <p className={styles.resultSource}>
            {result.status} · record {result.payroll_record_id}
          </p>
          <p className={styles.resultMessage}>{result.message}</p>
          <dl className={styles.resultGrid}>
            {(
              [
                ["gross_monthly_salary", result.calculations.gross_monthly_salary],
                ["szv_assessable_wage", result.calculations.szv_assessable_wage],
                [
                  "szv_aov_employer_contribution",
                  result.calculations.szv_aov_employer_contribution,
                ],
                [
                  "szv_aov_employee_deduction",
                  result.calculations.szv_aov_employee_deduction,
                ],
                ["wage_tax_deduction", result.calculations.wage_tax_deduction],
                ["net_take_home_pay", result.calculations.net_take_home_pay],
              ] as const
            ).map(([key, value]) => (
              <div key={key}>
                <dt>{key.replaceAll("_", " ")}</dt>
                <dd>
                  <code>{formatMoney(value)}</code>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </form>
  );
}
