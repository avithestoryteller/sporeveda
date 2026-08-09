import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, LineChart, ShieldCheck, Sprout } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sporeveda Farm Manager — Mushroom grow tracking" },
      {
        name: "description",
        content:
          "Track substrate batches, bag stages, contamination and harvest yields across every mushroom grow room.",
      },
      { property: "og:title", content: "Sporeveda Farm Manager — Mushroom grow tracking" },
      {
        property: "og:description",
        content:
          "Track substrate batches, bag stages, contamination and harvest yields across every mushroom grow room.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Sprout,
    title: "Bag-level lifecycle",
    body: "Follow every bag from prep through colonizing, bulking, fruiting and harvest with a full stage history.",
  },
  {
    icon: ShieldCheck,
    title: "Contamination control",
    body: "Log severity, contaminant type and the action taken, then watch rates per room and per batch.",
  },
  {
    icon: LineChart,
    title: "Yield and efficiency",
    body: "Harvest weights roll up into biological efficiency so you know which substrate recipes actually work.",
  },
  {
    icon: Activity,
    title: "Daily environment log",
    body: "One-tap temperature and humidity entries, compared against each room's target ranges.",
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(Boolean(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <span className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              S
            </span>
            <span className="font-display text-sm font-semibold">Sporeveda</span>
          </span>
          <div className="ml-auto">
            <Button asChild size="sm" variant={signedIn ? "default" : "outline"}>
              <Link to={signedIn ? "/dashboard" : "/auth"}>
                {signedIn ? "Open app" : "Sign in"}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-16">
        <section className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Mushroom farm operations
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">
            Every bag accounted for, from inoculation to final flush.
          </h1>
          <p className="mt-4 text-base text-muted-foreground">
            Sporeveda Farm Manager keeps your rooms, batches, bags, contamination events and
            harvests in one shared record — built for the tablet in the grow room, not the desk.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/dashboard" : "/auth"}>
                {signedIn ? "Go to dashboard" : "Get started"}
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-lg border border-border bg-card p-5">
              <feature.icon className="size-5 text-primary" />
              <h2 className="mt-3 font-display text-base font-semibold">{feature.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
