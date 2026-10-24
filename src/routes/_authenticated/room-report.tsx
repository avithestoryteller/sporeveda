import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadRoomReport } from "@/lib/room-report";
import { daysAgoISO, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/room-report")({
  head: () => ({
    meta: [
      { title: "Room report — Sporeveda Farm Manager" },
      {
        name: "description",
        content:
          "Download one Excel workbook with a room's climate readings, batches, bags, harvests and contamination events.",
      },
      { property: "og:title", content: "Room report — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content:
          "Download one Excel workbook with a room's climate readings, batches, bags, harvests and contamination events.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoomReportPage,
});

function RoomReportPage() {
  const orgId = useOrgId();
  const [farmId, setFarmId] = useState<string>("");
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  const { data: farms } = useQuery({
    queryKey: ["room-report-farms", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farms")
        .select("id, name")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function handleDownload() {
    if (!orgId || !farmId) return;
    const roomName = farms?.find((farm) => farm.id === farmId)?.name ?? "room";
    setBusy(true);
    try {
      await downloadRoomReport({ orgId, farmId, roomName, from, to });
      toast.success(`Downloaded the ${roomName} report`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Room report"
        subtitle="Everything about one room — climate, batches, bags, harvests and contamination — in a single Excel workbook."
      />

      <Card className="max-w-xl">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-base">Build your room report</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Room</Label>
            <Select value={farmId} onValueChange={setFarmId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a room" />
              </SelectTrigger>
              <SelectContent>
                {(farms ?? []).map((farm) => (
                  <SelectItem key={farm.id} value={farm.id}>
                    {farm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-from">From</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-to">To</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>

          <div className="sm:col-span-2">
            <Button
              onClick={handleDownload}
              disabled={busy || !farmId}
              className="w-full sm:w-auto"
            >
              <FileSpreadsheet className="size-4" />{" "}
              {busy ? "Preparing…" : "Download room report"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              The workbook has six sheets: room summary, environment readings, batches, bags,
              harvests, and contamination. Bags always cover the room's full history; the date
              range applies to readings, batches, harvests, and contamination.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
