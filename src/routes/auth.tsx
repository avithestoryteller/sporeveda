import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Sign in to Sporeveda Farm Manager to track batches, bags and harvests.",
      },
      { property: "og:title", content: "Sign in — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Sign in to Sporeveda Farm Manager to track batches, bags and harvests.",
      },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  function validate() {
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your details");
      return null;
    }
    return parsed.data;
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    const values = validate();
    if (!values) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(values);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    const values = validate();
    if (!values) return;
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      ...values,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      setAwaitingConfirmation(true);
      toast.success("Check your email to confirm your account");
      return;
    }
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          S
        </span>
        <span className="font-display text-lg font-semibold">Sporeveda Farm Manager</span>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-lg">Welcome back</CardTitle>
          <CardDescription>Sign in to your grow room records.</CardDescription>
        </CardHeader>
        <CardContent>
          {awaitingConfirmation ? (
            <div className="space-y-3 py-4 text-sm">
              <p className="font-medium">Confirm your email</p>
              <p className="text-muted-foreground">
                We sent a confirmation link to <span className="font-medium">{email}</span>. Open
                it, then come back and sign in.
              </p>
              <Button variant="outline" onClick={() => setAwaitingConfirmation(false)}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form className="space-y-3 pt-3" onSubmit={handleSignIn}>
                  <div className="space-y-1.5">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input
                      id="signin-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form className="space-y-3 pt-3" onSubmit={handleSignUp}>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Creating…" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
