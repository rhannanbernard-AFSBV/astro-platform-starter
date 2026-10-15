import type { DecimalString } from "./types";

/**
 * Display helpers only — no tax math. Values stay string-shaped Decimals
 * from the backend so IEEE-754 floats never enter financial paths.
 */
export function formatMoney(value: DecimalString | null | undefined): string {
  if (value == null || value === "") return "—";
  const normalized = String(value).trim();
  const negative = normalized.startsWith("-");
  const raw = negative ? normalized.slice(1) : normalized;
  const [wholePart, fracPart = ""] = raw.split(".");
  const digits = wholePart.replace(/\D/g, "") || "0";
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (fracPart + "00").slice(0, 2);
  return `${negative ? "-" : ""}${grouped}.${cents}`;
}

/** Keep user salary input as a decimal-looking string (no float coercion). */
export function sanitizeDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  const head = cleaned.slice(0, firstDot + 1);
  const tail = cleaned.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  return head + tail;
}
