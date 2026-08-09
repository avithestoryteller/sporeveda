export function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function daysSince(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

export function startOfMonthISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export function daysAgoISO(days: number) {
  const date = new Date(Date.now() - days * 86_400_000);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function num(value: number | string | null | undefined, digits = 1) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(parsed)) return "—";
  return parsed.toFixed(digits);
}

/** Postgres numerics come back as strings through PostgREST. */
export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(parsed) ? null : parsed;
}

export function range(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
  unit: string,
) {
  const lo = toNumber(min);
  const hi = toNumber(max);
  if (lo === null && hi === null) return "Not set";
  if (lo === null) return `≤ ${hi}${unit}`;
  if (hi === null) return `≥ ${lo}${unit}`;
  return `${lo}–${hi}${unit}`;
}
