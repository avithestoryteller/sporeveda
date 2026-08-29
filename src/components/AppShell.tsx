import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Warehouse,
  Building2,
  Boxes,
  ClipboardList,
  BarChart3,
  ListChecks,
  FileUp,
  Download,
  IndianRupee,
  LogOut,
} from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/NotificationsBell";
import logoAsset from "@/assets/sporeveda-logo.png.asset.json";



const NAV = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/farms", label: "Farms", icon: Building2 },
  { to: "/rooms", label: "Grow Rooms", icon: Warehouse },
  { to: "/batches", label: "Batches", icon: Boxes },
  { to: "/log", label: "Log", icon: ClipboardList },
  { to: "/compare", label: "Compare", icon: BarChart3 },
  { to: "/bulk", label: "Bulk", icon: ListChecks },
  { to: "/import", label: "Import", icon: FileUp },
  { to: "/export", label: "Export", icon: Download },
] as const;

const FINANCE_NAV = { to: "/finance", label: "Finance", icon: IndianRupee } as const;

export function AppShell({ children }: { children?: ReactNode }) {
  const { org, role, isAdmin } = useOrg();
  const navItems = isAdmin ? [...NAV, FINANCE_NAV] : [...NAV];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-30 border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link
            to="/dashboard"
            className="flex min-w-0 items-center gap-2 rounded-md bg-background px-2 py-1"
          >
            <img
              src={logoAsset.url}
              alt="Sporeveda"
              className="h-9 w-auto object-contain"
            />

          </Link>


          <nav className="ml-2 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors lg:px-3",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <div className="hidden text-right sm:block">
              <p className="max-w-[12rem] truncate text-xs font-medium">{org?.name}</p>
              <p className="text-[10px] uppercase tracking-wide text-sidebar-foreground/60">
                {role}
              </p>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              aria-label="Sign out"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-5">{children ?? <Outlet />}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card md:hidden">
        <div className="mx-auto flex max-w-6xl overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}
