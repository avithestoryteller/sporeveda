import { cn } from "@/lib/utils";
import { STAGE_CHIP, STAGE_LABEL, type BagStage } from "@/lib/stages";

export function StageBadge({
  stage,
  className,
  size = "default",
}: {
  stage: BagStage;
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium uppercase tracking-wide",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        STAGE_CHIP[stage],
        className,
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
