import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDate, num, todayISO } from "@/lib/format";
import { PAYMENT_METHODS, fmtMoney, presetRange, titleCase } from "@/lib/money";

export const Route = createFileRoute("/_authenticated/finance/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue log — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Record mushroom sales, buyers, quantities and prices per kilo.",
      },
      { property: "og:title", content: "Revenue log — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Record mushroom sales, buyers, quantities and prices per kilo.",
      },
    ],
  }),
  component: RevenuePage,
});

const NONE = "__none__";

type FormState = {
  saleDate: string;
  buyer: string;
  speciesId: string;
  produceItemId: string;
  quantity: string;
  price: string;
  amount: string;
  amountTouched: boolean;
  paymentMethod: string;
  farmId: string;
  batchId: string;
  notes: string;
};

const EMPTY: FormState = {
  saleDate: todayISO(),
  buyer: "",
  speciesId: NONE,
  produceItemId: NONE,
  quantity: "",
  price: "",
  amount: "",
  amountTouched: false,
  paymentMethod: "cash",
  farmId: NONE,
  batchId: NONE,
  notes: "",
};

function RevenuePage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({ from: presetRange("this_year").from, to: todayISO() });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { data: refs } = useQuery({
    queryKey: ["finance-refs-revenue", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [farms, batches, species, produce] = await Promise.all([
        supabase.from("farms").select("id, name").eq("org_id", orgId).order("name"),
        supabase
          .from("batches")
          .select("id, batch_code, farm_id")
          .eq("org_id", orgId)
          .order("inoculation_date", { ascending: false }),
        supabase.from("species").select("id, common_name").order("common_name"),
        supabase
          .from("inventory_items")
          .select("id, name, subcategory, species_id")
          .eq("org_id", orgId)
          .eq("category", "produce")
          .order("name"),
      ]);
      if (farms.error) throw farms.error;
      if (batches.error) throw batches.error;
      if (species.error) throw species.error;
      if (produce.error) throw produce.error;
      return {
        farms: farms.data ?? [],
        batches: batches.data ?? [],
        species: species.data ?? [],
        produce: produce.data ?? [],
      };
    },
  });

  const { data: sales, isLoading } = useQuery({
    queryKey: ["revenue", orgId, filters],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue")
        .select("*, species(common_name), batches(batch_code)")
        .eq("org_id", orgId)
        .gte("sale_date", filters.from)
        .lte("sale_date", filters.to)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const formBatches = useMemo(() => {
    const all = refs?.batches ?? [];
    if (form.farmId === NONE) return all;
    return all.filter((batch) => batch.farm_id === form.farmId);
  }, [refs?.batches, form.farmId]);

  const computedAmount = useMemo(() => {
    const qty = Number(form.quantity);
    const price = Number(form.price);
    if (!Number.isFinite(qty) || !Number.isFinite(price) || !form.quantity || !form.price) return "";
    return String(Math.round(qty * price * 100) / 100);
  }, [form.quantity, form.price]);

  const amountValue = form.amountTouched ? form.amount : computedAmount;
  const total = (sales ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  const addSale = useMutation({
    mutationFn: async () => {
      const amount = Number(amountValue);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      const { error } = await supabase.from("revenue").insert({
        org_id: orgId,
        sale_date: form.saleDate,
        buyer: form.buyer.trim() || null,
        species_id: form.speciesId === NONE ? null : form.speciesId,
        inventory_item_id: form.produceItemId === NONE ? null : form.produceItemId,
        quantity_kg: form.quantity ? Number(form.quantity) : null,
        price_per_kg: form.price ? Number(form.price) : null,
        amount,
        payment_method: form.paymentMethod,
        farm_id: form.farmId === NONE ? null : form.farmId,
        batch_id: form.batchId === NONE ? null : form.batchId,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sale logged");
      setForm({ ...EMPTY, saleDate: todayISO() });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["revenue"] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Revenue log"
        subtitle="Sales by buyer, species and batch."
        action={
          canEdit ? (
            <Button onClick={() => setShowForm((value) => !value)}>
              <Plus className="size-4" /> {showForm ? "Close" : "Add sale"}
            </Button>
          ) : undefined
        }
      />

      {showForm && canEdit ? (
        <Card className="mb-5">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">New sale</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                addSale.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="sale-date">Date</Label>
                <Input
                  id="sale-date"
                  type="date"
                  value={form.saleDate}
                  onChange={(event) => set("saleDate", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-buyer">Buyer</Label>
                <Input
                  id="sale-buyer"
                  value={form.buyer}
                  onChange={(event) => set("buyer", event.target.value)}
                  placeholder="Local market / restaurant"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Produce sold</Label>
                <Select
                  value={form.produceItemId}
                  onValueChange={(value) => {
                    set("produceItemId", value);
                    const item = (refs?.produce ?? []).find((row) => row.id === value);
                    if (item?.species_id) set("speciesId", item.species_id);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not linked to produce stock</SelectItem>
                    {(refs?.produce ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Linking a sale deducts the quantity from produce stock.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Species</Label>
                <Select value={form.speciesId} onValueChange={(value) => set("speciesId", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not specified</SelectItem>
                    {(refs?.species ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.common_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Payment method</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={(value) => set("paymentMethod", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {titleCase(method)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sale-qty">Quantity (kg)</Label>
                <Input
                  id="sale-qty"
                  inputMode="decimal"
                  value={form.quantity}
                  onChange={(event) => set("quantity", event.target.value)}
                  placeholder="12.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sale-price">Price per kg (₹)</Label>
                <Input
                  id="sale-price"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => set("price", event.target.value)}
                  placeholder="320"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sale-amount">Total amount (₹)</Label>
                <Input
                  id="sale-amount"
                  inputMode="decimal"
                  value={amountValue}
                  onChange={(event) => {
                    set("amountTouched", true);
                    set("amount", event.target.value);
                  }}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Auto-calculated from quantity × price — edit for flat-rate or bundled sales.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Room (optional)</Label>
                <Select
                  value={form.farmId}
                  onValueChange={(value) => {
                    set("farmId", value);
                    set("batchId", NONE);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No room</SelectItem>
                    {(refs?.farms ?? []).map((farm) => (
                      <SelectItem key={farm.id} value={farm.id}>
                        {farm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Batch (optional)</Label>
                <Select value={form.batchId} onValueChange={(value) => set("batchId", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No batch</SelectItem>
                    {formBatches.map((batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batch_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="sale-notes">Notes</Label>
                <Textarea
                  id="sale-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </div>

              <div className="sm:col-span-2">
                <Button type="submit" disabled={addSale.isPending} className="w-full sm:w-auto">
                  {addSale.isPending ? "Saving…" : "Save sale"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-5">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rev-from">From</Label>
            <Input
              id="rev-from"
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rev-to">To</Label>
            <Input
              id="rev-to"
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-display text-base">{sales?.length ?? 0} sales</CardTitle>
          <span className="stat-value text-lg">{fmtMoney(total)}</span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (sales ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No sales logged for this range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Buyer</th>
                    <th className="py-2 pr-3">Species</th>
                    <th className="py-2 pr-3 text-right">Qty (kg)</th>
                    <th className="py-2 pr-3 text-right">₹/kg</th>
                    <th className="py-2 pr-3">Batch</th>
                    <th className="py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(sales ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3">{fmtDate(row.sale_date)}</td>
                      <td className="py-2 pr-3">{row.buyer ?? "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {row.species?.common_name ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right">{num(row.quantity_kg, 2)}</td>
                      <td className="py-2 pr-3 text-right">{fmtMoney(row.price_per_kg)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {row.batches?.batch_code ?? "—"}
                      </td>
                      <td className="py-2 text-right font-medium">{fmtMoney(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
