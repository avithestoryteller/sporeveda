export type DailyAggregate = {
  date: string;
  count: number;
  avgTemp: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  avgHum: number | null;
  minHum: number | null;
  maxHum: number | null;
};

export type ParseResult = {
  days: DailyAggregate[];
  totalRows: number;
  skippedRows: number;
};

/** Sparse-day threshold: a full day at 2-minute intervals is ~720 readings. */
export const SPARSE_READING_THRESHOLD = 100;

function splitLine(line: string) {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function toDate(raw: string): string | null {
  // Accept "2026-08-09 22:34:00", ISO, or "2026/08/09 22:34"
  const normalized = raw.replace(/\//g, "-").replace("T", " ");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function toNum(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseHygrometerCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return { days: [], totalRows: 0, skippedRows: 0 };

  let timeIdx = 0;
  let tempIdx = 1;
  let humIdx = 2;
  let start = 0;

  const header = splitLine(lines[0]!);
  const looksLikeHeader = header.some((cell) => /time/i.test(cell));
  if (looksLikeHeader) {
    start = 1;
    header.forEach((cell, index) => {
      if (/time/i.test(cell)) timeIdx = index;
      else if (/temp/i.test(cell)) tempIdx = index;
      else if (/hum/i.test(cell)) humIdx = index;
    });
  }

  const buckets = new Map<string, { temps: number[]; hums: number[]; count: number }>();
  let totalRows = 0;
  let skippedRows = 0;

  for (let i = start; i < lines.length; i += 1) {
    const cells = splitLine(lines[i]!);
    const date = toDate(cells[timeIdx] ?? "");
    const temp = toNum(cells[tempIdx]);
    const hum = toNum(cells[humIdx]);
    if (!date || (temp === null && hum === null)) {
      skippedRows += 1;
      continue;
    }
    totalRows += 1;
    const bucket = buckets.get(date) ?? { temps: [], hums: [], count: 0 };
    if (temp !== null) bucket.temps.push(temp);
    if (hum !== null) bucket.hums.push(hum);
    bucket.count += 1;
    buckets.set(date, bucket);
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  const stats = (values: number[]) =>
    values.length === 0
      ? { avg: null, min: null, max: null }
      : {
          avg: round(values.reduce((sum, value) => sum + value, 0) / values.length),
          min: round(Math.min(...values)),
          max: round(Math.max(...values)),
        };

  const days = [...buckets.entries()]
    .map(([date, bucket]) => {
      const temp = stats(bucket.temps);
      const hum = stats(bucket.hums);
      return {
        date,
        count: bucket.count,
        avgTemp: temp.avg,
        minTemp: temp.min,
        maxTemp: temp.max,
        avgHum: hum.avg,
        minHum: hum.min,
        maxHum: hum.max,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return { days, totalRows, skippedRows };
}
