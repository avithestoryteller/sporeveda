import { Badge } from "@/components/ui/badge";

export function SourceBadge({ source }: { source: string | null | undefined }) {
  const imported = source === "sensor_import";
  return (
    <Badge variant={imported ? "secondary" : "outline"} className="text-[10px] uppercase tracking-wide">
      {imported ? "Imported" : "Manual"}
    </Badge>
  );
}
