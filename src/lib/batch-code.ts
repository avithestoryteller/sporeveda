/** Batch code helpers: B<species><batch number><variety>-ddmmyy (e.g. BO1P-280826). */

/** Varieties that carry no variety letter in the code. */
const PLAIN_VARIETIES = new Set(["white", "plain", "common", "regular"]);

/** Known species words; anything paired with one of these is treated as the variety. */
const SPECIES_WORDS = new Set([
  "oyster",
  "shiitake",
  "reishi",
  "button",
  "milky",
  "enoki",
  "maitake",
  "cordyceps",
  "portobello",
  "cremini",
]);

/** Split a common name into { species, variety }, handling "Oyster - Grey" and "Grey Oyster". */
export function splitName(commonName: string) {
  const parts = commonName
    .split(/[-–—/,()]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  let words: string[];
  if (parts.length > 1) {
    words = parts;
  } else {
    words = commonName.trim().split(/\s+/).filter(Boolean);
  }
  if (words.length === 0) return { species: "", variety: "" };
  if (words.length === 1) return { species: words[0] ?? "", variety: "" };

  const speciesIndex = words.findIndex((word) => SPECIES_WORDS.has(word.toLowerCase()));
  if (speciesIndex === -1) {
    // No known species word: treat the whole name as the species.
    return { species: words[words.length - 1] ?? "", variety: "" };
  }
  const species = words[speciesIndex] ?? "";
  const variety = words.filter((_, index) => index !== speciesIndex).join(" ");
  return { species, variety };
}

export function speciesLetter(commonName: string) {
  const { species } = splitName(commonName);
  return (species[0] ?? "X").toUpperCase();
}

export function varietyLetter(commonName: string) {
  const { variety } = splitName(commonName);
  const first = variety.trim().split(/\s+/)[0] ?? "";
  if (!first) return "";
  if (PLAIN_VARIETIES.has(first.toLowerCase())) return "";
  return first[0]!.toUpperCase();
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
