import { createFileRoute, Link } from "@tanstack/react-router";
import { ListChecks, FileUp, Download, FileSpreadsheet } from "lucide-react";

import { PageHeader } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/data")({
  component: DataHubPage,
  head: () => ({
    meta: [
      { title: "Data Tools | Sporeveda Farm Manager" },
      { name: "description", content: "Bulk updates, CSV imports, and data exports for Sporeveda." },
      { property: "og:title", content: "Data Tools | Sporeveda Farm Manager" },
      { property: "og:description", content: "Bulk updates, CSV imports, and data exports for Sporeveda." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TOOLS = [
  {
    to: "/bulk",
    label: "Bulk updates",
    description: "Update many bags, batches, or items at once by changing any field.",
    icon: ListChecks,
  },
  {
    to: "/import",
    label: "Import data",
    description: "Upload hygrometer CSV exports to bulk-load environment readings.",
    icon: FileUp,
  },
  {
    to: "/export",
    label: "Export data",
    description: "Download filtered CSVs of bags, batches, harvests, costs, inventory, and more.",
    icon: Download,
  },
  {
    to: "/room-report",
    label: "Room report",
    description: "One Excel workbook per room: climate, batches, bags, harvests, and contamination.",
    icon: FileSpreadsheet,
  },
] as const;

function DataHubPage() {
  return (
    <div>
      <PageHeader
        title="Data tools"
        subtitle="Bulk updates, imports, and exports all in one place."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.to}
              to={tool.to}
              className={cn(
                "group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/50"
              )}
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-3 text-primary">
                  <Icon className="size-6" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold group-hover:text-primary">
                    {tool.label}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
