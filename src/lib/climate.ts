export type ClimateDeltaStatus = "in" | "below" | "above" | "unknown";

export type ClimateDelta = {
  status: ClimateDeltaStatus;
  /** Signed distance to the nearest target edge. 0 when inside the band. */
  delta: number;
  /** How severe the miss is relative to the band width. */
  severity: "none" | "near" | "far";
};

/**
 * Distance between an actual reading and a target band.
 * Negative = colder/drier than target, positive = warmer/wetter than target.
 */
export function climateDelta(
  actual: number | null | undefined,
  min: number | null | undefined,
  max: number | null | undefined,
): ClimateDelta {
  if (actual == null || (min == null && max == null)) {
    return { status: "unknown", delta: 0, severity: "none" };
  }

  const bandWidth = min != null && max != null ? Math.abs(max - min) : 0;
  const tolerance = Math.max(bandWidth * 0.1, 1);

  if (min != null && actual < min) {
    const delta = actual - min;
    return {
      status: "below",
      delta,
      severity: Math.abs(delta) <= tolerance ? "near" : "far",
    };
  }
  if (max != null && actual > max) {
    const delta = actual - max;
    return {
      status: "above",
      delta,
      severity: Math.abs(delta) <= tolerance ? "near" : "far",
    };
  }
  return { status: "in", delta: 0, severity: "none" };
}

export function formatDelta(delta: number, unit: string) {
  const rounded = Math.round(Math.abs(delta) * 10) / 10;
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${rounded.toLocaleString("en-IN", { maximumFractionDigits: 1 })}${unit}`;
}
