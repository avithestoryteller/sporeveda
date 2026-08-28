import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NOTIFICATIONS_QUERY_KEY, type NotificationRow } from "@/lib/notifications";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Bell in the top bar showing unread in-app notifications for the current org. */
export function NotificationsBell() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: [NOTIFICATIONS_QUERY_KEY, orgId],
    enabled: Boolean(orgId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, read_at, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const rows = data ?? [];
  const unread = rows.filter((row) => !row.read_at);

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_QUERY_KEY] }),
  });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread.length ? `${unread.length} unread notifications` : "Notifications"}
          className="relative text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Bell className="size-4" />
          {unread.length ? (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground">
              {unread.length > 9 ? "9+" : unread.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread.length ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => markRead.mutate(unread.map((row) => row.id))}
            >
              <Check className="size-3.5" /> Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing to catch up on.
            </p>
          ) : (
            rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className={cn(
                  "block w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/60",
                  row.read_at ? "opacity-70" : "bg-muted/30",
                )}
                onClick={() => {
                  if (!row.read_at) markRead.mutate([row.id]);
                  if (row.link) navigate({ to: row.link as never });
                }}
              >
                <p className="text-sm font-medium">{row.title}</p>
                {row.body ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.body}</p>
                ) : null}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {fmtDate(row.created_at)}
                </p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
