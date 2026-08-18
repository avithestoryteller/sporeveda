import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Package, Pencil, Plus, ShoppingCart, Trash2, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { fmtDate, todayISO, toNumber } from "@/lib/format";
import { fmtMoney, titleCase } from "@/lib/money";
import {
  DEFAULT_SPAWN_PER_BAG_KG,
  DEFAULT_SUBSTRATE_PER_BAG_KG,
  SPAWN_PER_BAG_STORAGE_KEY,
  SUBSTRATE_PER_BAG_STORAGE_KEY,
  deriveUsageByItem,
} from "@/lib/materials";

export const Route = createFileRoute("/_authenticated/finance/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Sporeveda Farm Manager" },
      {
        name: "description",
        content:
          "Track substrate, spawn and packaging stock levels, purchases and weighted average unit costs.",
      },
      { property: "og:title", content: "Inventory — Sporeveda Farm Manager" },
      {
        property: "og:description",
        content:
          "Track substrate, spawn and packaging stock levels, purchases and weighted average unit costs.",
      },
    ],
  }),
  component: InventoryPage,
});

const NONE = "__none__";

const ITEM_CATEGORIES = ["substrate", "spawn", "packaging", "supplement", "equipment", "other"];
const UNITS = ["kg", "g", "litre", "bag", "block", "piece", "box"];

type ItemForm = {
  name: string;
  category: string;
  unit: string;
  threshold: string;
  notes: string;
  wastage: string;
  wastageNotes: string;
};
const EMPTY_ITEM: ItemForm = {
  name: "",
  category: "substrate",
  unit: "kg",
  threshold: "",
  notes: "",
  wastage: "",
  wastageNotes: "",
};

type PurchaseForm = {
  itemId: string;
  quantity: string;
  amount: string;
  incurredDate: string;
  farmId: string;
  batchId: string;
  description: string;
  notes: string;
};
const EMPTY_PURCHASE: PurchaseForm = {
  itemId: "",
  quantity: "",
  amount: "",
  incurredDate: todayISO(),
  farmId: NONE,
  batchId: NONE,
  description: "",
  notes: "",
};

function InventoryPage() {
  const orgId = useOrgId();
  const { canEdit } = useOrg();
  const queryClient = useQueryClient();

  const [itemForm, setItemForm] = useState<ItemForm>(EMPTY_ITEM);
  const [purchaseForm, setPurchaseForm] = useState<PurchaseForm>(EMPTY_PURCHASE);
  const [openForm, setOpenForm] = useState<"item" | "purchase" | null>(null);
  const [spawnPerBagKg, setSpawnPerBagKg] = useState(DEFAULT_SPAWN_PER_BAG_KG);

  useEffect(() => {
    const stored = window.localStorage.getItem(SPAWN_PER_BAG_STORAGE_KEY);
    const parsed = stored === null ? NaN : Number(stored);
    if (Number.isFinite(parsed) && parsed > 0) setSpawnPerBagKg(parsed);
  }, []);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);

  const setItem = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) =>
    setItemForm((prev) => ({ ...prev, [key]: value }));
  const setPurchase = <K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) =>
    setPurchaseForm((prev) => ({ ...prev, [key]: value }));

  const { data: stock, isLoading } = useQuery({
    queryKey: ["inventory-stock", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_inventory_stock")
        .select("*")
        .eq("org_id", orgId)
        .order("category")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: refs } = useQuery({
    queryKey: ["inventory-refs", orgId],
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

  const { data: consumption } = useQuery({
    queryKey: ["inventory-consumption", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [links, bags, batchRows] = await Promise.all([
        supabase
          .from("costs")
          .select("inventory_item_id, batch_id, quantity_purchased")
          .eq("org_id", orgId)
          .not("inventory_item_id", "is", null)
          .not("batch_id", "is", null),
        supabase.from("bags").select("batch_id").eq("org_id", orgId),
        supabase.from("batches").select("id, dry_substrate_weight_kg").eq("org_id", orgId),
      ]);
      if (links.error) throw links.error;
      if (bags.error) throw bags.error;
      if (batchRows.error) throw batchRows.error;

      const bagsPerBatch: Record<string, number> = {};
      for (const bag of bags.data ?? []) {
        if (!bag.batch_id) continue;
        bagsPerBatch[bag.batch_id] = (bagsPerBatch[bag.batch_id] ?? 0) + 1;
      }
      const substrateKgPerBatch: Record<string, number> = {};
      for (const batch of batchRows.data ?? []) {
        substrateKgPerBatch[batch.id] = Number(batch.dry_substrate_weight_kg ?? 0) || 0;
      }
      return { links: links.data ?? [], bagsPerBatch, substrateKgPerBatch };
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["inventory-purchases", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costs")
        .select("*, inventory_items(name, unit), farms(name), batches(batch_code)")
        .eq("org_id", orgId)
        .not("inventory_item_id", "is", null)
        .order("incurred_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: itemRows } = useQuery({
    queryKey: ["inventory-items", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*")
        .eq("org_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const resetItemForm = () => {
    setItemForm(EMPTY_ITEM);
    setEditingItemId(null);
    setOpenForm(null);
  };
  const resetPurchaseForm = () => {
    setPurchaseForm({ ...EMPTY_PURCHASE, incurredDate: todayISO() });
    setEditingPurchaseId(null);
    setOpenForm(null);
  };

  const startEditItem = (id: string) => {
    const row = (itemRows ?? []).find((item) => item.id === id);
    if (!row) return;
    setItemForm({
      name: row.name ?? "",
      category: row.category ?? "other",
      unit: row.unit ?? "kg",
      threshold: row.reorder_threshold === null ? "" : String(row.reorder_threshold),
      notes: row.notes ?? "",
    });
    setEditingItemId(id);
    setOpenForm("item");
  };

  const startEditPurchase = (row: {
    id: string;
    inventory_item_id: string | null;
    quantity_purchased: number | null;
    amount: number;
    incurred_date: string;
    farm_id: string | null;
    batch_id: string | null;
    description: string | null;
    notes: string | null;
  }) => {
    setPurchaseForm({
      itemId: row.inventory_item_id ?? "",
      quantity: row.quantity_purchased === null ? "" : String(row.quantity_purchased),
      amount: String(row.amount ?? ""),
      incurredDate: row.incurred_date ?? todayISO(),
      farmId: row.farm_id ?? NONE,
      batchId: row.batch_id ?? NONE,
      description: row.description ?? "",
      notes: row.notes ?? "",
    });
    setEditingPurchaseId(row.id);
    setOpenForm("purchase");
  };

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item deleted");
      if (editingItemId) resetItemForm();
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    },
    onError: (error: Error) =>
      toast.error(
        error.message.includes("foreign key")
          ? "Delete the purchases for this item first"
          : error.message,
      ),
  });

  const deletePurchase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Purchase deleted");
      if (editingPurchaseId) resetPurchaseForm();
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-consumption"] });
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = useMemo(
    () =>
      (stock ?? []).map((row) => ({
        id: row.inventory_item_id ?? "",
        name: row.name ?? "Item",
        unit: row.unit ?? "",
        category: row.category ?? "other",
      })),
    [stock],
  );

  const formBatches = useMemo(() => {
    const all = refs?.batches ?? [];
    if (purchaseForm.farmId === NONE) return all;
    return all.filter((batch) => batch.farm_id === purchaseForm.farmId);
  }, [refs?.batches, purchaseForm.farmId]);

  const derivedUsage = useMemo(() => {
    if (!consumption) return {} as Record<string, number>;
    const categoryByItem: Record<string, string> = {};
    for (const row of stock ?? []) {
      if (row.inventory_item_id) categoryByItem[row.inventory_item_id] = row.category ?? "other";
    }
    return deriveUsageByItem({
      costRows: consumption.links,
      bagsPerBatch: consumption.bagsPerBatch,
      substrateKgPerBatch: consumption.substrateKgPerBatch,
      categoryByItem,
      spawnPerBagKg,
    });
  }, [consumption, stock, spawnPerBagKg]);

  /** Stock rows adjusted for production consumption derived from bags and batches. */
  const stockRows = useMemo(
    () =>
      (stock ?? []).map((row) => {
        const derived = row.inventory_item_id ? (derivedUsage[row.inventory_item_id] ?? 0) : 0;
        const purchased = toNumber(row.total_purchased_qty) ?? 0;
        const logged = toNumber(row.total_used_qty) ?? 0;
        const avgCost = toNumber(row.avg_unit_cost) ?? 0;
        const remaining = Math.max(purchased - logged - derived, 0);
        return { ...row, derivedUsed: derived, remaining, remainingValue: remaining * avgCost };
      }),
    [stock, derivedUsage],
  );

  const stockValue = stockRows.reduce((sum, row) => sum + row.remainingValue, 0);
  const lowStock = stockRows.filter((row) => {
    const threshold = toNumber(row.reorder_threshold);
    return threshold !== null && row.remaining <= threshold;
  });

  const addItem = useMutation({
    mutationFn: async () => {
      const name = itemForm.name.trim();
      if (name.length < 2) throw new Error("Enter an item name");
      const threshold = itemForm.threshold.trim() ? Number(itemForm.threshold) : null;
      const payload = {
        name,
        category: itemForm.category,
        unit: itemForm.unit,
        reorder_threshold: threshold !== null && Number.isFinite(threshold) ? threshold : null,
        notes: itemForm.notes.trim() || null,
      };
      if (editingItemId) {
        const { error } = await supabase
          .from("inventory_items")
          .update(payload)
          .eq("id", editingItemId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("inventory_items")
        .insert({ org_id: orgId, ...payload });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingItemId ? "Item updated" : "Item added");
      resetItemForm();
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-consumption"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addPurchase = useMutation({
    mutationFn: async () => {
      if (!purchaseForm.itemId) throw new Error("Pick an item");
      const quantity = Number(purchaseForm.quantity);
      const amount = Number(purchaseForm.amount);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Enter a valid quantity");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
      const item = items.find((row) => row.id === purchaseForm.itemId);
      const payload = {
        category: item?.category ?? "other",
        description:
          purchaseForm.description.trim() ||
          `${item?.name ?? "Inventory"} purchase — ${quantity} ${item?.unit ?? ""}`.trim(),
        amount,
        cost_type: "one_time",
        incurred_date: purchaseForm.incurredDate,
        inventory_item_id: purchaseForm.itemId,
        quantity_purchased: quantity,
        farm_id: purchaseForm.farmId === NONE ? null : purchaseForm.farmId,
        batch_id: purchaseForm.batchId === NONE ? null : purchaseForm.batchId,
        notes: purchaseForm.notes.trim() || null,
      };
      if (editingPurchaseId) {
        const { error } = await supabase.from("costs").update(payload).eq("id", editingPurchaseId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("costs").insert({ org_id: orgId, ...payload });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(editingPurchaseId ? "Purchase updated" : "Purchase recorded");
      resetPurchaseForm();
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-consumption"] });
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Stock on hand, weighted average unit cost and every purchase you log."
        action={
          canEdit ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (openForm === "item" && !editingItemId) {
                    setOpenForm(null);
                    return;
                  }
                  setItemForm(EMPTY_ITEM);
                  setEditingItemId(null);
                  setOpenForm("item");
                }}
              >
                <Plus className="size-4" /> Item
              </Button>
              <Button
                onClick={() => {
                  if (openForm === "purchase" && !editingPurchaseId) {
                    setOpenForm(null);
                    return;
                  }
                  setPurchaseForm({ ...EMPTY_PURCHASE, incurredDate: todayISO() });
                  setEditingPurchaseId(null);
                  setOpenForm("purchase");
                }}
                disabled={items.length === 0}
              >
                <ShoppingCart className="size-4" /> Purchase
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Items tracked" value={stock?.length ?? 0} />
        <StatTile label="Stock value" value={fmtMoney(stockValue)} hint="Weighted average cost" />
        <StatTile
          label="Low stock"
          value={lowStock.length}
          hint={lowStock.length ? lowStock.map((row) => row.name).join(", ") : "All above threshold"}
          tone={lowStock.length ? "destructive" : "default"}
        />
      </div>

      {openForm === "item" && canEdit ? (
        <Card className="mt-5">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">
              {editingItemId ? "Edit inventory item" : "New inventory item"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                addItem.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="item-name">Name</Label>
                <Input
                  id="item-name"
                  value={itemForm.name}
                  onChange={(event) => setItem("name", event.target.value)}
                  placeholder="Wheat straw"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={itemForm.category}
                  onValueChange={(value) => setItem("category", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {titleCase(category)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select value={itemForm.unit} onValueChange={(value) => setItem("unit", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-threshold">Reorder threshold (optional)</Label>
                <Input
                  id="item-threshold"
                  inputMode="decimal"
                  value={itemForm.threshold}
                  onChange={(event) => setItem("threshold", event.target.value)}
                  placeholder="25"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="item-notes">Notes</Label>
                <Textarea
                  id="item-notes"
                  value={itemForm.notes}
                  onChange={(event) => setItem("notes", event.target.value)}
                  rows={2}
                />
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={addItem.isPending}>
                  {addItem.isPending ? "Saving…" : editingItemId ? "Save changes" : "Add item"}
                </Button>
                {editingItemId ? (
                  <>
                    <Button type="button" variant="ghost" onClick={resetItemForm}>
                      <X className="size-4" /> Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      className="ml-auto"
                      disabled={deleteItem.isPending}
                      onClick={() => {
                        if (window.confirm("Delete this item? Purchases must be removed first."))
                          deleteItem.mutate(editingItemId);
                      }}
                    >
                      <Trash2 className="size-4" /> Delete item
                    </Button>
                  </>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {openForm === "purchase" && canEdit ? (
        <Card className="mt-5">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-base">
              {editingPurchaseId ? "Edit purchase" : "Record purchase"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                addPurchase.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label>Item</Label>
                <Select
                  value={purchaseForm.itemId}
                  onValueChange={(value) => setPurchase("itemId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-date">Purchase date</Label>
                <Input
                  id="purchase-date"
                  type="date"
                  value={purchaseForm.incurredDate}
                  onChange={(event) => setPurchase("incurredDate", event.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-qty">Quantity</Label>
                <Input
                  id="purchase-qty"
                  inputMode="decimal"
                  value={purchaseForm.quantity}
                  onChange={(event) => setPurchase("quantity", event.target.value)}
                  placeholder="50"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-amount">Total amount (₹)</Label>
                <Input
                  id="purchase-amount"
                  inputMode="decimal"
                  value={purchaseForm.amount}
                  onChange={(event) => setPurchase("amount", event.target.value)}
                  placeholder="1500"
                  required
                />
                {Number(purchaseForm.quantity) > 0 && Number(purchaseForm.amount) > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {fmtMoney(Number(purchaseForm.amount) / Number(purchaseForm.quantity), true)} per{" "}
                    {items.find((item) => item.id === purchaseForm.itemId)?.unit ?? "unit"}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label>Room (optional)</Label>
                <Select
                  value={purchaseForm.farmId}
                  onValueChange={(value) => {
                    setPurchase("farmId", value);
                    setPurchase("batchId", NONE);
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
                <Select
                  value={purchaseForm.batchId}
                  onValueChange={(value) => setPurchase("batchId", value)}
                >
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
                <Label htmlFor="purchase-desc">Description</Label>
                <Input
                  id="purchase-desc"
                  value={purchaseForm.description}
                  onChange={(event) => setPurchase("description", event.target.value)}
                  placeholder="Straw from Sharma Traders"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="purchase-notes">Notes</Label>
                <Textarea
                  id="purchase-notes"
                  rows={2}
                  value={purchaseForm.notes}
                  onChange={(event) => setPurchase("notes", event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <div className="flex gap-2">
                  <Button type="submit" disabled={addPurchase.isPending}>
                    {addPurchase.isPending
                      ? "Saving…"
                      : editingPurchaseId
                        ? "Save changes"
                        : "Record purchase"}
                  </Button>
                  {editingPurchaseId ? (
                    <>
                      <Button type="button" variant="ghost" onClick={resetPurchaseForm}>
                        <X className="size-4" /> Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        className="ml-auto"
                        disabled={deletePurchase.isPending}
                        onClick={() => {
                          if (window.confirm("Delete this purchase?"))
                            deletePurchase.mutate(editingPurchaseId);
                        }}
                      >
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    </>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Purchases are also logged in the Costs ledger, so financials stay in sync.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Stock on hand</h2>
        <div className="flex items-center gap-2">
          <Label htmlFor="spawn-per-bag" className="text-xs text-muted-foreground">
            Spawn used per bag (g)
          </Label>
          <Input
            id="spawn-per-bag"
            className="h-8 w-24"
            inputMode="decimal"
            value={Math.round(spawnPerBagKg * 1000)}
            onChange={(event) => {
              const grams = Number(event.target.value);
              if (!Number.isFinite(grams) || grams < 0) return;
              setSpawnPerBagKg(grams / 1000);
              window.localStorage.setItem(SPAWN_PER_BAG_STORAGE_KEY, String(grams / 1000));
            }}
          />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : stockRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Package className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No inventory items yet. Add an item, then record your first purchase.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stockRows.map((row) => {
            const remaining = row.remaining;
            const threshold = toNumber(row.reorder_threshold);
            const low = threshold !== null && remaining <= threshold;
            return (
              <Card key={row.inventory_item_id ?? row.name}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{titleCase(row.category)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {low ? <Badge variant="destructive">Low</Badge> : null}
                      {canEdit && row.inventory_item_id ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Edit ${row.name}`}
                          onClick={() => startEditItem(row.inventory_item_id!)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="stat-value mt-3 text-2xl">
                    {remaining.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                    <span className="text-sm font-normal text-muted-foreground">{row.unit}</span>
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <dt>Avg cost</dt>
                      <dd className="text-foreground">
                        {fmtMoney(row.avg_unit_cost, true)} / {row.unit}
                      </dd>
                    </div>
                    <div>
                      <dt>Stock value</dt>
                      <dd className="text-foreground">{fmtMoney(row.remainingValue)}</dd>
                    </div>
                    <div>
                      <dt>Purchased</dt>
                      <dd className="text-foreground">
                        {toNumber(row.total_purchased_qty) ?? 0} {row.unit}
                      </dd>
                    </div>
                    <div>
                      <dt>Used</dt>
                      <dd className="text-foreground">
                        {(
                          (toNumber(row.total_used_qty) ?? 0) + row.derivedUsed
                        ).toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                        {row.unit}
                      </dd>
                    </div>
                    {row.derivedUsed > 0 ? (
                      <div className="col-span-2">
                        <dt>Consumed in production</dt>
                        <dd className="text-foreground">
                          {row.derivedUsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                          {row.unit}{" "}
                          <span className="text-muted-foreground">
                            {row.category === "spawn"
                              ? `(${(spawnPerBagKg * 1000).toFixed(0)} g per bag)`
                              : "(batch substrate weight)"}
                          </span>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-8 font-display text-lg font-semibold">Recent purchases</h2>
      <Card>
        <CardContent className="p-0">
          {(purchases ?? []).length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No purchases recorded yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {(purchases ?? []).map((row) => {
                const qty = toNumber(row.quantity_purchased);
                const unit = row.inventory_items?.unit ?? "";
                return (
                  <div key={row.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {row.inventory_items?.name ?? "Item"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(row.incurred_date)}
                        {qty ? ` · ${qty} ${unit}` : ""}
                        {row.batches?.batch_code ? ` · ${row.batches.batch_code}` : ""}
                        {row.farms?.name ? ` · ${row.farms.name}` : ""}
                      </p>
                      {row.description ? (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {row.description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="text-right">
                        <p className="stat-value text-sm">{fmtMoney(row.amount)}</p>
                        {qty ? (
                          <p className="text-xs text-muted-foreground">
                            {fmtMoney(Number(row.amount) / qty, true)}/{unit}
                          </p>
                        ) : null}
                      </div>
                      {canEdit ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Edit purchase"
                            onClick={() => startEditPurchase(row)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete purchase"
                            disabled={deletePurchase.isPending}
                            onClick={() => {
                              if (window.confirm("Delete this purchase?"))
                                deletePurchase.mutate(row.id);
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
