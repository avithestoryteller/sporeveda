import type { Database } from "@/integrations/supabase/types";

export type BagStage = Database["public"]["Enums"]["bag_stage"];
export type ContaminationSeverity = Database["public"]["Enums"]["contamination_severity"];
export type ContaminationAction = Database["public"]["Enums"]["contamination_action"];

export const STAGE_ORDER: BagStage[] = [
  "prep",
  "colonizing",
  "bulking",
  "fruiting",
  "harvested",
  "discarded",
];

/** Stages a bag naturally progresses through (discarded is a manual exit). */
export const STAGE_FLOW: BagStage[] = ["prep", "colonizing", "bulking", "fruiting", "harvested"];

export const STAGE_LABEL: Record<BagStage, string> = {
  prep: "Prep",
  colonizing: "Colonizing",
  bulking: "Bulking",
  fruiting: "Fruiting",
  harvested: "Harvested",
  discarded: "Discarded",
};

/** Raw CSS custom properties for charts (the --color-* aliases are @theme inline). */
export const STAGE_COLOR: Record<BagStage, string> = {
  prep: "var(--stage-prep)",
  colonizing: "var(--stage-colonizing)",
  bulking: "var(--stage-bulking)",
  fruiting: "var(--stage-fruiting)",
  harvested: "var(--stage-harvested)",
  discarded: "var(--stage-discarded)",
};

export const STAGE_DOT: Record<BagStage, string> = {

  prep: "bg-stage-prep",
  colonizing: "bg-stage-colonizing",
  bulking: "bg-stage-bulking",
  fruiting: "bg-stage-fruiting",
  harvested: "bg-stage-harvested",
  discarded: "bg-stage-discarded",
};

export const STAGE_CHIP: Record<BagStage, string> = {
  prep: "bg-stage-prep text-stage-foreground",
  colonizing: "bg-stage-colonizing text-stage-foreground",
  bulking: "bg-stage-bulking text-stage-foreground",
  fruiting: "bg-stage-fruiting text-stage-foreground",
  harvested: "bg-stage-harvested text-stage-foreground",
  discarded: "bg-stage-discarded text-stage-foreground",
};

export function nextStage(stage: BagStage): BagStage | null {
  const index = STAGE_FLOW.indexOf(stage);
  if (index === -1 || index === STAGE_FLOW.length - 1) return null;
  return STAGE_FLOW[index + 1] ?? null;
}

export const SEVERITY_LABEL: Record<ContaminationSeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};

export const ACTION_LABEL: Record<ContaminationAction, string> = {
  monitoring: "Monitoring",
  isolated: "Isolated",
  discarded: "Discarded",
};
