import { toNumber } from "./format";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display-only INR formatting; stored values are untouched plain numerics. */
export function fmtMoney(value: number | string | null | undefined, precise = false) {
  const parsed = toNumber(value);
  if (parsed === null) return "—";
  return precise ? INR_PRECISE.format(parsed) : INR.format(parsed);
}

export function fmtSignedMoney(value: number | string | null | undefined) {
  const parsed = toNumber(value);
  if (parsed === null) return "—";
  const formatted = fmtMoney(Math.abs(parsed));
  return parsed < 0 ? `-${formatted}` : formatted;
}

export const COST_CATEGORIES = [
  "substrate",
  "spawn",
  "packaging",
  "electricity",
  "labor",
  "rent",
  "equipment",
  "marketing",
  "other",
] as const;

export const RECURRENCE_INTERVALS = ["weekly", "monthly", "quarterly", "yearly"] as const;

export const PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "credit", "other"] as const;

export function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export type DateRangePreset = "this_month" | "last_30" | "this_year" | "all" | "custom";

function iso(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function presetRange(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  switch (preset) {
    case "this_month":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case "last_30":
      return { from: iso(new Date(now.getTime() - 29 * 86_400_000)), to: today };
    case "this_year":
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: today };
    case "all":
      return { from: "1970-01-01", to: today };
    default:
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
}

export function fmtMonth(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}
