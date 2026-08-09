import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { createOrganization } from "@/lib/org.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function OrgSetup() {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const queryClient = useQueryClient();
  const createOrg = useServerFn(createOrganization);

  const mutation = useMutation({
    mutationFn: (payload: { name: string; displayName?: string }) =>
      createOrg({ data: payload }),
    onSuccess: async () => {
      toast.success("Organization created");
      await queryClient.invalidateQueries({ queryKey: ["memberships"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="font-display text-xl">Set up your farm business</CardTitle>
          <CardDescription>
            Everything in Sporeveda — rooms, batches, bags and harvests — lives under an
            organization. Create yours to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (trimmed.length < 2) {
                toast.error("Enter an organization name");
                return;
              }
              mutation.mutate({
                name: trimmed,
                displayName: displayName.trim() || undefined,
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={name}
                maxLength={80}
                placeholder="Sporeveda"
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Your name (optional)</Label>
              <Input
                id="display-name"
                value={displayName}
                maxLength={80}
                placeholder="How your name shows on activity"
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create organization"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
