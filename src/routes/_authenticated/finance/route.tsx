import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import { useOrg } from "@/hooks/use-org";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance")({
  component: FinanceLayout,
});

const TABS = [
  { to: "/finance", label: "Overview", exact: true },
  { to: "/finance/costs", label: "Costs", exact: false },
  { to: "/finance/revenue", label: "Revenue", exact: false },
  { to: "/finance/inventory", label: "Inventory", exact: false },
  { to: "/finance/produce", label: "Produce", exact: false },
] as const;

function FinanceLayout() {
  const { isAdmin } = useOrg();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (!isAdmin) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="font-display text-lg">Finance is restricted</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only organisation owners and admins can view financial records.
        </p>
      </div>
    );
  }

  return (
    <div>
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.to : pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
