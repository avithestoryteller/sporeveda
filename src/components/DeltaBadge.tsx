import { climateDelta, formatDelta } from "@/lib/climate";
import { cn } from "@/lib/utils";

export function DeltaBadge({
  actual,
  min,
  max,
  unit,
  label,
  className,
}: {
  actual: number | null | undefined;
  min: number | null | undefined;
  max: number | null | undefined;
  unit: string;
  /** Optional prefix, e.g. "Fruiting". */
  label?: string;
  className?: string;
}) {
  const { status, delta, severity } = climateDelta(actual, min, max);

  const text =
    status === "unknown" ? "—" : status === "in" ? "In range" : formatDelta(delta, unit);

  const tone =
    status === "unknown"
      ? "bg-muted text-muted-foreground"
      : status === "in"
        ? "bg-success/10 text-success"
        : severity === "near"
          ? "bg-warning/15 text-warning"
          : "bg-destructive/10 text-destructive";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
      title={
        status === "below"
          ? "Below target"
          : status === "above"
            ? "Above target"
            : status === "in"
              ? "Within target"
              : "No target or reading"
      }
    >
      {label ? <span className="opacity-70">{label}</span> : null}
      {text}
    </span>
  );
}
