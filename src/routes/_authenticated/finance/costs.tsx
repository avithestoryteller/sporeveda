import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmtDate, todayISO } from "@/lib/format";
import {
  COST_CATEGORIES,
  RECURRENCE_INTERVALS,
  fmtMoney,
  presetRange,
  titleCase,
} from "@/lib/money";
import {
  EMPTY_LINE,
  MATERIAL_CATEGORIES,
  VARIETY_SUGGESTIONS,
  ensureInventoryItem,
  materialItemName,
  type MaterialCategory,
  type MaterialLine,
} from "@/lib/materials";

export const Route = createFileRoute("/_authenticated/finance/costs")({
  head: () => ({
    meta: [
      { title: "Costs log — Sporeveda Farm Manager" },
      {
        name: "description",
        content: "Log substrate, labour, electricity and other farm costs in seconds.",
      },
      { property: "og:title", content: "Costs log — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content: "Log substrate, labour, electricity and other farm costs in seconds.",
      },
    ],
  }),
  component: CostsPage,
});

const ALL = "__all__";
const NONE = "__none__";

const MULTI_BATCH_CATEGORIES = MATERIAL_CATEGORIES as readonly string[];

type FormState = {
  category: string;
  otherCategory: string;
  description: string;
  amount: string;
  costType: "one_time" | "recurring";
  recurrence: string;
  incurredDate: string;
  farmId: string;
  batchId: string;
  batchIds: string[];
  splitAmount: boolean;
  notes: string;
  lines: MaterialLine[];
};

const EMPTY: FormState = {
  category: "substrate",
  otherCategory: "",
  description: "",
  amount: "",
  costType: "one_time",
  recurrence: "monthly",
  incurredDate: todayISO(),
  farmId: NONE,
  batchId: NONE,
  batchIds: [],
  splitAmount: true,
  notes: "",
  lines: [{ ...EMPTY_LINE }],
};

function CostsPage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState({
    from: presetRange("this_year").from,
    to: todayISO(),
    category: ALL,
    costType: ALL,
    farmId: ALL,
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { data: refs } = useQuery({
    queryKey: ["finance-refs", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [farms, batches] = await Promise.all([
        supabase.from("farms").select("id, name").eq("org_id", orgId).order("name"),
        supabase
          .from("batches")
          .select("id, batch_code, farm_id")
          .eq("org_id", orgId)
          .order("inoculation_date", { ascending: false }),
      ]);
      if (farms.error) throw farms.error;
      if (batches.error) throw batches.error;
      return { farms: farms.data ?? [], batches: batches.data ?? [] };
    },
  });

  const { data: costs, isLoading } = useQuery({
    queryKey: ["costs", orgId, filters],
    enabled: Boolean(orgId),
    queryFn: async () => {
      let query = supabase
        .from("costs")
        .select("*, farms(name), batches(batch_code), inventory_items(name, unit)")
        .eq("org_id", orgId)
        .gte("incurred_date", filters.from)
        .lte("incurred_date", filters.to)
        .order("incurred_date", { ascending: false });
      if (filters.category !== ALL) query = query.eq("category", filters.category);
      if (filters.costType !== ALL) query = query.eq("cost_type", filters.costType);
      if (filters.farmId !== ALL) query = query.eq("farm_id", filters.farmId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const formBatches = useMemo(() => {
    const all = refs?.batches ?? [];
    if (form.farmId === NONE) return all;
    return all.filter((batch) => batch.farm_id === form.farmId);
  }, [refs?.batches, form.farmId]);

  const total = (costs ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  const isMultiBatch = MULTI_BATCH_CATEGORIES.includes(form.category);
  const isMaterial = isMultiBatch;

  const setLine = (index: number, key: keyof MaterialLine, value: string) =>
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, [key]: value } : line)),
    }));
  const addLine = () => setForm((prev) => ({ ...prev, lines: [...prev.lines, { ...EMPTY_LINE }] }));
  const removeLine = (index: number) =>
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.length > 1 ? prev.lines.filter((_, i) => i !== index) : prev.lines,
    }));

  const linesTotal = form.lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);

  const addCost = useMutation({
    mutationFn: async () => {
      const category = form.category === "other" ? form.otherCategory.trim() || "other" : form.category;

      if (isMaterial) {
        const lines = form.lines.filter(
          (line) => line.name.trim() || line.amount.trim() || line.quantity.trim(),
        );
        if (lines.length === 0) throw new Error("Add at least one line item");
        for (const line of lines) {
          if (!line.name.trim()) throw new Error("Every line item needs a name");
          const lineAmount = Number(line.amount);
          if (!Number.isFinite(lineAmount) || lineAmount <= 0)
            throw new Error(`Enter a valid amount for ${line.name.trim()}`);
          const qty = Number(line.quantity);
          if (!Number.isFinite(qty) || qty <= 0)
            throw new Error(`Enter the quantity (kg) for ${line.name.trim()}`);
        }

        const targets = form.batchIds.length > 0 ? form.batchIds : [null];
        const split = form.splitAmount && targets.length > 1;
        const base = {
          org_id: orgId,
          category,
          cost_type: form.costType,
          recurrence_interval: form.costType === "recurring" ? form.recurrence : null,
          incurred_date: form.incurredDate,
          farm_id: form.farmId === NONE ? null : form.farmId,
          notes: form.notes.trim() || null,
        };

        const rows: TablesInsert<"costs">[] = [];
        for (const line of lines) {
          const itemName = materialItemName(line.name, line.variety);
          const itemId = await ensureInventoryItem({
            orgId: orgId!,
            name: itemName,
            category,
          });
          const lineAmount = Number(line.amount);
          const lineQty = Number(line.quantity);
          targets.forEach((batchId, index) => {
            const divisor = split ? targets.length : 1;
            const isLast = index === targets.length - 1;
            const amountShare = split
              ? isLast
                ? Math.round((lineAmount - Math.round((lineAmount / divisor) * 100) / 100 * (targets.length - 1)) * 100) / 100
                : Math.round((lineAmount / divisor) * 100) / 100
              : lineAmount;
            const qtyShare = split ? Math.round((lineQty / divisor) * 1000) / 1000 : lineQty;
            rows.push({
              ...base,
              batch_id: batchId,
              inventory_item_id: itemId,
              quantity_purchased: qtyShare,
              amount: amountShare,
              description:
                form.description.trim() ||
                `${itemName} — ${qtyShare} kg`,
            });
          });
        }

        if (editingId) {
          const [first, ...rest] = rows;
          const { org_id: _omit, ...update } = first!;
          const { error } = await supabase.from("costs").update(update).eq("id", editingId);
          if (error) throw error;
          if (rest.length > 0) {
            const { error: insertError } = await supabase.from("costs").insert(rest);
            if (insertError) throw insertError;
          }
          return "updated" as const;
        }
        const { error } = await supabase.from("costs").insert(rows);
        if (error) throw error;
        return "created" as const;
      }

      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      const targets = isMultiBatch && form.batchIds.length > 0 ? form.batchIds : [null];
      const perRow =
        isMultiBatch && form.splitAmount && targets.length > 1
          ? Math.round((amount / targets.length) * 100) / 100
          : amount;
      const base = {
        category,
        description: form.description.trim() || null,
        cost_type: form.costType,
        recurrence_interval: form.costType === "recurring" ? form.recurrence : null,
        incurred_date: form.incurredDate,
        farm_id: form.farmId === NONE ? null : form.farmId,
        notes: form.notes.trim() || null,
      };
      const rows = targets.map((batchId, index) => ({
        ...base,
        batch_id: isMultiBatch ? batchId : form.batchId === NONE ? null : form.batchId,
        amount:
          index === targets.length - 1 && perRow !== amount
            ? Math.round((amount - perRow * (targets.length - 1)) * 100) / 100
            : perRow,
      }));

      if (editingId) {
        const [first, ...rest] = rows;
        const { error } = await supabase.from("costs").update(first!).eq("id", editingId);
        if (error) throw error;
        if (rest.length > 0) {
          const { error: insertError } = await supabase
            .from("costs")
            .insert(rest.map((row) => ({ org_id: orgId, ...row })));
          if (insertError) throw insertError;
        }
        return "updated" as const;
      }
      const { error } = await supabase
        .from("costs")
        .insert(rows.map((row) => ({ org_id: orgId, ...row })));
      if (error) throw error;
      return "created" as const;
    },
    onSuccess: (result) => {
      toast.success(result === "updated" ? "Cost updated" : "Cost logged");
      setForm({ ...EMPTY, incurredDate: todayISO() });
      setEditingId(null);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  type CostRow = NonNullable<typeof costs>[number];

  function lineFromRow(row: CostRow): MaterialLine {
    const itemName = row.inventory_items?.name ?? "";
    const [name, variety] = itemName.split(" — ");
    return {
      name: name ?? "",
      variety: variety ?? "",
      quantity: row.quantity_purchased === null ? "" : String(row.quantity_purchased),
      amount: String(row.amount ?? ""),
    };
  }

  function fillFrom(row: CostRow, mode: "edit" | "duplicate") {
    const known = (COST_CATEGORIES as readonly string[]).includes(row.category);
    setForm({
      category: known ? row.category : "other",
      otherCategory: known ? "" : row.category,
      description: row.description ?? "",
      amount: String(row.amount ?? ""),
      costType: mode === "edit" ? (row.cost_type as FormState["costType"]) : "recurring",
      recurrence: row.recurrence_interval ?? "monthly",
      incurredDate: mode === "edit" ? row.incurred_date : todayISO(),
      farmId: row.farm_id ?? NONE,
      batchId: row.batch_id ?? NONE,
      batchIds: row.batch_id ? [row.batch_id] : [],
      splitAmount: false,
      notes: row.notes ?? "",
      lines: [lineFromRow(row)],
    });
    setEditingId(mode === "edit" ? row.id : null);
    setShowForm(true);
  }

  function duplicate(row: CostRow) {
    fillFrom(row, "duplicate");
    toast.info("Pre-filled from last entry — confirm the date and save");
  }

  function startEdit(row: CostRow) {
    fillFrom(row, "edit");
  }

  return (
    <div>
      <PageHeader
        title="Costs log"
        subtitle="Every rupee spent, tagged by category, room and batch."
        action={
          canEdit ? (
            <Button
              onClick={() => {
                setShowForm((value) => {
                  if (value) setEditingId(null);
                  return !value;
                });
              }}
            >
              <Plus className="size-4" /> {showForm ? "Close" : "Add cost"}
            </Button>
          ) : undefined
        }
      />

      {showForm && canEdit ? (
        <Card className="mb-5">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">
              {editingId ? "Edit cost" : "New cost"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                addCost.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(value) => set("category", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {titleCase(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.category === "other" ? (
                  <Input
                    className="mt-2"
                    placeholder="Custom category"
                    value={form.otherCategory}
                    onChange={(event) => set("otherCategory", event.target.value)}
                  />
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cost-amount">Amount (₹)</Label>
                <Input
                  id="cost-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(event) => set("amount", event.target.value)}
                  placeholder="1500"
                  required
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cost-description">Description</Label>
                <Input
                  id="cost-description"
                  value={form.description}
                  onChange={(event) => set("description", event.target.value)}
                  placeholder="August electricity bill"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Type</Label>
                <RadioGroup
                  className="flex gap-4 pt-1"
                  value={form.costType}
                  onValueChange={(value) => set("costType", value as FormState["costType"])}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="one_time" id="cost-onetime" />
                    <Label htmlFor="cost-onetime" className="font-normal">
                      One-time
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="recurring" id="cost-recurring" />
                    <Label htmlFor="cost-recurring" className="font-normal">
                      Recurring
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {form.costType === "recurring" ? (
                <div className="space-y-1.5">
                  <Label>Repeats</Label>
                  <Select value={form.recurrence} onValueChange={(value) => set("recurrence", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_INTERVALS.map((interval) => (
                        <SelectItem key={interval} value={interval}>
                          {titleCase(interval)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div />
              )}

              <div className="space-y-1.5">
                <Label htmlFor="cost-date">Date</Label>
                <Input
                  id="cost-date"
                  type="date"
                  value={form.incurredDate}
                  onChange={(event) => set("incurredDate", event.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Room (optional)</Label>
                <Select
                  value={form.farmId}
                  onValueChange={(value) => {
                    set("farmId", value);
                    set("batchId", NONE);
                    set("batchIds", []);
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

              {isMultiBatch ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Batches (optional — select one or more)</Label>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
                    {formBatches.length === 0 ? (
                      <p className="p-1 text-sm text-muted-foreground">No batches available.</p>
                    ) : (
                      formBatches.map((batch) => {
                        const checked = form.batchIds.includes(batch.id);
                        return (
                          <label
                            key={batch.id}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                set(
                                  "batchIds",
                                  value
                                    ? [...form.batchIds, batch.id]
                                    : form.batchIds.filter((id) => id !== batch.id),
                                )
                              }
                            />
                            {batch.batch_code}
                          </label>
                        );
                      })
                    )}
                  </div>
                  {form.batchIds.length > 1 ? (
                    <label className="flex items-center gap-2 pt-1 text-sm text-muted-foreground">
                      <Checkbox
                        checked={form.splitAmount}
                        onCheckedChange={(value) => set("splitAmount", Boolean(value))}
                      />
                      Split amount evenly across {form.batchIds.length} batches
                      {form.splitAmount && Number(form.amount) > 0
                        ? ` (~${fmtMoney(Number(form.amount) / form.batchIds.length)} each)`
                        : " (full amount on each)"}
                    </label>
                  ) : null}
                </div>
              ) : (
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
              )}

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cost-notes">Notes</Label>
                <Textarea
                  id="cost-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </div>

              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={addCost.isPending} className="w-full sm:w-auto">
                  {addCost.isPending ? "Saving…" : editingId ? "Update cost" : "Save cost"}
                </Button>
                {editingId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                      setForm({ ...EMPTY, incurredDate: todayISO() });
                      setShowForm(false);
                    }}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>

            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-5">
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="filter-from">From</Label>
            <Input
              id="filter-from"
              type="date"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filter-to">To</Label>
            <Input
              id="filter-to"
              type="date"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={filters.category}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, category: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {COST_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {titleCase(category)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={filters.costType}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, costType: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                <SelectItem value="one_time">One-time</SelectItem>
                <SelectItem value="recurring">Recurring</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Room</Label>
            <Select
              value={filters.farmId}
              onValueChange={(value) => setFilters((prev) => ({ ...prev, farmId: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All rooms</SelectItem>
                {(refs?.farms ?? []).map((farm) => (
                  <SelectItem key={farm.id} value={farm.id}>
                    {farm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="font-display text-base">
            {costs?.length ?? 0} entries
          </CardTitle>
          <span className="stat-value text-lg">{fmtMoney(total)}</span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (costs ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No costs logged for this filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3">Room</th>
                    <th className="py-2 pr-3">Batch</th>
                    <th className="py-2 pr-3 text-right">Amount</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(costs ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="whitespace-nowrap py-2 pr-3">{fmtDate(row.incurred_date)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <span>{titleCase(row.category)}</span>
                          {row.cost_type === "recurring" ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {titleCase(row.recurrence_interval ?? "recurring")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              One-time
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{row.description ?? "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{row.farms?.name ?? "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {row.batches?.batch_code ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium">{fmtMoney(row.amount)}</td>
                      <td className="py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {row.cost_type === "recurring" && canEdit ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => duplicate(row)}
                              aria-label="Duplicate last entry"
                            >
                              <Copy className="size-4" />
                            </Button>
                          ) : null}
                          {canEdit ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEdit(row)}
                              aria-label="Edit cost"
                            >
                              <Pencil className="size-4" />
                            </Button>
                          ) : null}
                        </div>
                      </td>
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
