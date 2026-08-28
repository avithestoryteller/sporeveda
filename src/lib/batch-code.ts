/** Batch code helpers: B<species><batch number><variety>-ddmmyy (e.g. BO1P-280826). */

/** Varieties that carry no variety letter in the code. */
const PLAIN_VARIETIES = new Set(["white", "plain", "common"]);

export function speciesLetter(commonName: string) {
  const words = commonName.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] ?? "";
  return (last[0] ?? "X").toUpperCase();
}

export function varietyLetter(commonName: string) {
  const words = commonName.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return "";
  const first = words[0] ?? "";
  if (PLAIN_VARIETIES.has(first.toLowerCase())) return "";
  return (first[0] ?? "").toUpperCase();
}

export function ddmmyy(isoDate: string) {
  const [year = "", month = "", day = ""] = isoDate.split("-");
  return `${day}${month}${year.slice(2)}`;
}

export function buildBatchCode(commonName: string, batchNumber: number, isoDate: string) {
  return `B${speciesLetter(commonName)}${batchNumber}${varietyLetter(commonName)}-${ddmmyy(isoDate)}`;
}

/** Next sequence number for a species, based on codes already used. */
export function nextBatchNumber(existingCodes: string[], commonName: string) {
  const prefix = `B${speciesLetter(commonName)}`;
  const variety = varietyLetter(commonName);
  let max = 0;
  for (const code of existingCodes) {
    const match = new RegExp(`^${prefix}(\\d+)${variety}-`).exec(code.trim());
    const value = match ? Number(match[1]) : NaN;
    if (Number.isFinite(value) && value > max) max = value;
  }
  return max + 1;
}

/** Bag codes are limited to two digits. */
export function bagCode(batchCode: string, bagNumber: number) {
  return `${batchCode}-${String(bagNumber).padStart(2, "0")}`;
}

export const MAX_BAG_NUMBER = 99;
