import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useOrg, useOrgId } from "@/hooks/use-org";
import { PageHeader } from "@/components/AppShell";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  type BatchWeights,
  DEFAULT_PP_BAG_WEIGHT_G,
  DEFAULT_SPAWN_PER_BAG_KG,
  DEFAULT_SUBSTRATE_PER_BAG_KG,
  PP_BAG_WEIGHT_STORAGE_KEY,
  SPAWN_PER_BAG_STORAGE_KEY,
  SUBSTRATE_PER_BAG_STORAGE_KEY,
  derivePackagingUsage,
  deriveUsageDetailByItem,
  ensureInventoryItem,
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

const PURCHASE_STATUSES = [
  { value: "ordered", label: "Ordered" },
  { value: "in_transit", label: "In transit" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];
const ITEM_STATUSES = [
  { value: "in_stock", label: "In stock" },
  { value: "on_order", label: "On order" },
  { value: "depleted", label: "Depleted" },
  { value: "discontinued", label: "Discontinued" },
];

function labelFor(list: { value: string; label: string }[], value: string | null | undefined) {
  return list.find((entry) => entry.value === value)?.label ?? null;
}

function PurchaseStatusBadge({ status }: { status: string | null | undefined }) {
  const label = labelFor(PURCHASE_STATUSES, status);
  if (!label) return null;
  const variant =
    status === "received" ? "default" : status === "cancelled" ? "destructive" : "secondary";
  return (
    <Badge variant={variant} className="text-[10px]">
      {label}
    </Badge>
  );
}

function ItemStatusBadge({ status }: { status: string | null | undefined }) {
  const label = labelFor(ITEM_STATUSES, status);
  if (!label || status === "in_stock") return null;
  return (
    <Badge variant="outline" className="text-[10px]">
      {label}
    </Badge>
  );
}

type ItemForm = {
  name: string;
  category: string;
  unit: string;
  status: string;
  vendor: string;
  threshold: string;
  totalQty: string;
  notes: string;
  wastageQty: string;
  wastageReason: string;
  orderReplacement: boolean;
  replacementStatus: string;
};
const EMPTY_ITEM: ItemForm = {
  name: "",
  category: "substrate",
  unit: "kg",
  status: "in_stock",
  vendor: "",
  threshold: "",
  totalQty: "",
  notes: "",
  wastageQty: "",
  wastageReason: "",
  orderReplacement: false,
  replacementStatus: "ordered",
};



type PurchaseForm = {
  category: string;
  itemId: string;
  itemName: string;
  unit: string;
  vendor: string;
  status: string;
  quantity: string;
  amount: string;
  incurredDate: string;
  farmId: string;
  batchId: string;
  description: string;
  notes: string;
};
const EMPTY_PURCHASE: PurchaseForm = {
  category: "substrate",
  itemId: "",
  itemName: "",
  unit: "kg",
  vendor: "",
  status: "received",
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
  const [substratePerBagKg, setSubstratePerBagKg] = useState(DEFAULT_SUBSTRATE_PER_BAG_KG);

  useEffect(() => {
    const read = (key: string) => {
      const stored = window.localStorage.getItem(key);
      const parsed = stored === null ? NaN : Number(stored);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const spawn = read(SPAWN_PER_BAG_STORAGE_KEY);
    if (spawn) setSpawnPerBagKg(spawn);
    const substrate = read(SUBSTRATE_PER_BAG_STORAGE_KEY);
    if (substrate) setSubstratePerBagKg(substrate);
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
        supabase
          .from("bags")
          .select("batch_id, spawn_weight_kg, dry_weight_kg, current_stage, inoculation_date")
          .eq("org_id", orgId),
        supabase
          .from("batches")
          .select("id, substrate_type, substrate_vendor, spawn_vendor, species(common_name)")
          .eq("org_id", orgId),
      ]);
      if (links.error) throw links.error;
      if (bags.error) throw bags.error;
      if (batchRows.error) throw batchRows.error;

      const bagsPerBatch: Record<string, number> = {};
      const weightsPerBatch: Record<string, BatchWeights> = {};
      for (const bag of bags.data ?? []) {
        if (!bag.batch_id) continue;
        bagsPerBatch[bag.batch_id] = (bagsPerBatch[bag.batch_id] ?? 0) + 1;
        const entry = (weightsPerBatch[bag.batch_id] ??= {
          spawnKg: 0,
          spawnMissingBags: 0,
          substrateKg: 0,
          substrateMissingBags: 0,
        });
        const spawn = Number(bag.spawn_weight_kg);
        if (Number.isFinite(spawn) && spawn > 0) entry.spawnKg += spawn;
        // Bags still in prep have not been inoculated yet — no spawn consumed.
        else if (bag.current_stage !== "prep") entry.spawnMissingBags += 1;
        const dry = Number(bag.dry_weight_kg);
        if (Number.isFinite(dry) && dry > 0) entry.substrateKg += dry;
        else entry.substrateMissingBags += 1;
      }

      const totalBags = (bags.data ?? []).length;

      return {
        links: links.data ?? [],
        bagsPerBatch,
        weightsPerBatch,
        batches: batchRows.data ?? [],
        totalBags,
      };


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
      status: (row as { status?: string | null }).status ?? "in_stock",
      vendor: (row as { vendor?: string | null }).vendor ?? "",

      threshold: row.reorder_threshold === null ? "" : String(row.reorder_threshold),
      totalQty: String(
        toNumber(
          stockRows.find((stockRow) => stockRow.inventory_item_id === id)?.total_purchased_qty,
        ) ?? 0,
      ),
      notes: row.notes ?? "",
      wastageQty: "",
      wastageReason: "",
      orderReplacement: false,
      replacementStatus: "ordered",
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
    category?: string | null;
    vendor?: string | null;
    status?: string | null;
    inventory_items?: { name: string | null; unit: string | null } | null;
  }) => {
    const linked = allItems.find((item) => item.id === row.inventory_item_id);
    setPurchaseForm({
      category: linked?.category ?? row.category ?? "other",
      itemId: row.inventory_item_id ?? "",
      itemName: row.inventory_items?.name ?? linked?.name ?? "",
      unit: row.inventory_items?.unit ?? linked?.unit ?? "kg",
      vendor: row.vendor ?? "",
      status: row.status ?? "received",
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

  /** Every inventory item, including ones with no purchases yet. */
  const allItems = useMemo(
    () =>
      (itemRows ?? []).map((row) => ({
        id: row.id,
        name: row.name ?? "Item",
        unit: row.unit ?? "kg",
        category: row.category ?? "other",
      })),
    [itemRows],
  );

  /** Vendor recorded on each inventory item, for display on the stock tiles. */
  const vendorByItem = useMemo(
    () =>
      Object.fromEntries(
        (itemRows ?? []).map((row) => [row.id, (row as { vendor?: string | null }).vendor ?? ""]),
      ) as Record<string, string>,
    [itemRows],
  );


  const categoryItems = useMemo(
    () => allItems.filter((item) => item.category === purchaseForm.category),
    [allItems, purchaseForm.category],
  );

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of purchases ?? []) {
      const vendor = (row as { vendor?: string | null }).vendor;
      if (vendor && vendor.trim()) set.add(vendor.trim());
    }
    return [...set].sort();
  }, [purchases]);



  const derivedUsage = useMemo(() => {
    if (!consumption) return {} as Record<string, { qty: number; bags: number }>;
    const categoryByItem: Record<string, string> = {};
    for (const row of stock ?? []) {
      if (row.inventory_item_id) categoryByItem[row.inventory_item_id] = row.category ?? "other";
    }
    const usage = deriveUsageDetailByItem({
      costRows: consumption.links,
      bagsPerBatch: consumption.bagsPerBatch,
      weightsPerBatch: consumption.weightsPerBatch,

      categoryByItem,
      spawnPerBagKg,
      substratePerBagKg,
      batches: (consumption.batches ?? []).map((batch) => ({
        id: batch.id,
        substrate_type: batch.substrate_type,
        substrate_vendor: (batch as { substrate_vendor?: string | null }).substrate_vendor ?? null,
        spawn_vendor: (batch as { spawn_vendor?: string | null }).spawn_vendor ?? null,
        species: (Array.isArray(batch.species) ? batch.species[0] : batch.species) ?? null,
      })),
      items: (itemRows ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        vendor: (row as { vendor?: string | null }).vendor ?? null,
      })),
    });

    // Empty PP grow bags: one per bag ever created, including discarded ones.
    const packaging = derivePackagingUsage({
      items: (stock ?? []).map((row) => ({
        id: row.inventory_item_id as string,
        name: row.name as string | null,
        purchased: toNumber(row.total_purchased_qty) ?? 0,
      })),
      totalBags: consumption.totalBags ?? 0,
      gramsPerBag: ppBagWeightG,
    });
    return { ...usage, ...packaging };
  }, [consumption, stock, itemRows, spawnPerBagKg, substratePerBagKg, ppBagWeightG]);


  /** Items whose purchase row was auto-created from a batch and still needs details. */
  const needsReviewItems = useMemo(() => {
    const set = new Set<string>();
    for (const row of purchases ?? []) {
      const notes = (row as { notes?: string | null }).notes ?? "";
      const amount = Number(row.amount) || 0;
      if (row.inventory_item_id && notes.startsWith("Auto-created from a new batch") && amount === 0) {
        set.add(row.inventory_item_id);
      }
    }
    return set;
  }, [purchases]);


  /** Stock rows adjusted for production consumption derived from bags and batches. */
  const stockRows = useMemo(
    () =>
      (stock ?? []).map((row) => {
        const detail = row.inventory_item_id ? derivedUsage[row.inventory_item_id] : undefined;
        const derived = detail?.qty ?? 0;
        const derivedBags = detail?.bags ?? 0;
        const purchased = toNumber(row.total_purchased_qty) ?? 0;
        const logged = toNumber(row.total_used_qty) ?? 0;
        const avgCost = toNumber(row.avg_unit_cost) ?? 0;
        const remaining = Math.max(purchased - logged - derived, 0);
        return {
          ...row,
          derivedUsed: derived,
          derivedBags,
          remaining,
          remainingValue: remaining * avgCost,
        };
      }),

    [stock, derivedUsage],
  );

  const stockValue = stockRows.reduce((sum, row) => sum + row.remainingValue, 0);

  /** Usage totals for the item currently being edited. */
  const editingItemUsage = useMemo(() => {
    const row = editingItemId
      ? stockRows.find((item) => item.inventory_item_id === editingItemId)
      : undefined;
    const used = (toNumber(row?.total_used_qty) ?? 0) + (row?.derivedUsed ?? 0);
    return { used, purchased: toNumber(row?.total_purchased_qty) ?? 0 };
  }, [editingItemId, stockRows]);

  /** Zero-stock items stay in the summary only when a real replacement / re-order is incoming. */
  const replacementItemIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of purchases ?? []) {
      const status = (row as { status?: string | null }).status ?? "received";
      const notes = (row as { notes?: string | null }).notes ?? "";
      // Auto-created placeholder shortage rows don't count as real replacements.
      const isPlaceholder = notes.startsWith("Auto-created");
      if (
        row.inventory_item_id &&
        (status === "ordered" || status === "in_transit") &&
        !isPlaceholder
      ) {
        ids.add(row.inventory_item_id);
      }
    }
    return ids;
  }, [purchases]);


  const depletedRows = useMemo(
    () =>
      stockRows.filter(
        (row) =>
          row.remaining <= 0.0001 &&
          !replacementItemIds.has(row.inventory_item_id ?? ""),
      ),
    [stockRows, replacementItemIds],
  );

  const activeStockRows = useMemo(
    () => stockRows.filter((row) => !depletedRows.includes(row)),
    [stockRows, depletedRows],
  );

  /** Items with ordered / in-transit purchases that have not landed in stock yet. */
  const incomingItems = useMemo(
    () =>
      stockRows
        .map((row) => ({
          id: row.inventory_item_id ?? "",
          name: row.name ?? "Item",
          unit: row.unit ?? "",
          qty: toNumber((row as { incoming_qty?: number | null }).incoming_qty) ?? 0,
        }))
        .filter((row) => row.qty > 0),
    [stockRows],
  );

  /** Purchases still awaiting receipt, grouped by item — powers the one-click receive action. */
  const pendingPurchasesByItem = useMemo(() => {
    const map = new Map<string, { ids: string[]; qty: number }>();
    for (const row of purchases ?? []) {
      const itemId = row.inventory_item_id;
      if (!itemId) continue;
      const status = (row as { status?: string | null }).status ?? "received";
      if (status !== "ordered" && status !== "in_transit") continue;
      const entry = map.get(itemId) ?? { ids: [], qty: 0 };
      entry.ids.push(row.id);
      entry.qty += toNumber(row.quantity_purchased) ?? 0;
      map.set(itemId, entry);
    }
    return map;
  }, [purchases]);

  const markInStock = useMutation({
    mutationFn: async (itemId: string) => {
      const pending = pendingPurchasesByItem.get(itemId);
      if (!pending || pending.ids.length === 0)
        throw new Error("Nothing on order for this item — record a purchase first");
      const received = await supabase
        .from("costs")
        .update({ status: "received" })
        .in("id", pending.ids);
      if (received.error) throw received.error;
      const updated = await supabase
        .from("inventory_items")
        .update({ status: "in_stock" })
        .eq("id", itemId);
      if (updated.error) throw updated.error;
    },
    onSuccess: () => {
      toast.success("Marked in stock");
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-purchases"] });
      queryClient.invalidateQueries({ queryKey: ["costs"] });
      queryClient.invalidateQueries({ queryKey: ["financials"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lowStock = activeStockRows.filter((row) => {
    const threshold = toNumber(row.reorder_threshold);
    return threshold !== null && row.remaining <= threshold;
  });

  /** Per-item purchase analytics derived from the inventory-linked cost rows. */
  const purchaseAnalytics = useMemo(() => {
    type Stat = {
      itemId: string;
      name: string;
      unit: string;
      category: string;
      orders: number;
      qty: number;
      spend: number;
      minRate: number | null;
      maxRate: number | null;
      lastRate: number | null;
      lastDate: string | null;
    };
    const byItem = new Map<string, Stat>();
    for (const row of purchases ?? []) {
      const itemId = row.inventory_item_id;
      if (!itemId) continue;
      const qty = toNumber(row.quantity_purchased) ?? 0;
      const amount = Number(row.amount) || 0;
      const rate = qty > 0 ? amount / qty : null;
      const stat =
        byItem.get(itemId) ??
        ({
          itemId,
          name: row.inventory_items?.name ?? "Item",
          unit: row.inventory_items?.unit ?? "",
          category: row.category ?? "other",
          orders: 0,
          qty: 0,
          spend: 0,
          minRate: null,
          maxRate: null,
          lastRate: null,
          lastDate: null,
        } satisfies Stat);
      stat.orders += 1;
      stat.qty += qty;
      stat.spend += amount;
      if (rate !== null) {
        stat.minRate = stat.minRate === null ? rate : Math.min(stat.minRate, rate);
        stat.maxRate = stat.maxRate === null ? rate : Math.max(stat.maxRate, rate);
        // purchases are ordered newest first, so the first rate seen is the latest
        if (stat.lastRate === null) {
          stat.lastRate = rate;
          stat.lastDate = row.incurred_date ?? null;
        }
      }
      if (!stat.lastDate) stat.lastDate = row.incurred_date ?? null;
      byItem.set(itemId, stat);
    }
    const rows = [...byItem.values()]
      .map((stat) => ({ ...stat, avgRate: stat.qty > 0 ? stat.spend / stat.qty : null }))
      .sort((a, b) => b.spend - a.spend);
    const totalSpend = rows.reduce((sum, row) => sum + row.spend, 0);
    const totalOrders = rows.reduce((sum, row) => sum + row.orders, 0);
    return { rows, totalSpend, totalOrders };
  }, [purchases]);

  const addItem = useMutation({
    mutationFn: async () => {
      const name = itemForm.name.trim();
      if (name.length < 2) throw new Error("Enter an item name");
      const threshold = itemForm.threshold.trim() ? Number(itemForm.threshold) : null;
      const payload = {
        name,
        category: itemForm.category,
        unit: itemForm.unit,
        status: itemForm.status,
        vendor: itemForm.vendor.trim() || null,

        reorder_threshold: threshold !== null && Number.isFinite(threshold) ? threshold : null,
        notes: itemForm.notes.trim() || null,
      };
      const totalRaw = itemForm.totalQty.trim();
      const total = totalRaw ? Number(totalRaw) : 0;
      if (totalRaw && (!Number.isFinite(total) || total < 0))
        throw new Error("Enter a valid total weight / quantity");

      const wastageRaw = itemForm.wastageQty.trim();
      const wastage = wastageRaw ? Number(wastageRaw) : 0;
      if (wastageRaw && (!Number.isFinite(wastage) || wastage <= 0))
        throw new Error("Enter a valid wastage quantity");

      if (editingItemId) {
        const current = stockRows.find((row) => row.inventory_item_id === editingItemId);
        const purchased = toNumber(current?.total_purchased_qty) ?? 0;
        const used =
          (toNumber(current?.total_used_qty) ?? 0) + (current?.derivedUsed ?? 0) + wastage;
        const diff = total - purchased;
        const finalStatus =
          total <= used + 0.0001 && (total > 0 || used > 0) ? "depleted" : payload.status;
        const { error } = await supabase
          .from("inventory_items")
          .update({ ...payload, status: finalStatus })
          .eq("id", editingItemId);
        if (error) throw error;
        if (Math.abs(diff) > 0.0001) {
          const adjust = await supabase.from("costs").insert({
            org_id: orgId,
            category: payload.category,
            vendor: payload.vendor,
            status: "received",
            description: `${name} — total adjusted to ${total} ${payload.unit}`,
            amount: 0,
            cost_type: "one_time",
            incurred_date: todayISO(),
            inventory_item_id: editingItemId,
            quantity_purchased: diff,
            notes: "Stock total adjustment",
          });
          if (adjust.error) throw adjust.error;
        }
        if (wastage > 0) {
          const reason = itemForm.wastageReason.trim();
          const logged = await supabase.from("inventory_usage").insert({
            org_id: orgId,
            inventory_item_id: editingItemId,
            quantity_used: wastage,
            used_date: todayISO(),
            notes: reason ? `Wastage — ${reason}` : "Wastage",
          });
          if (logged.error) throw logged.error;
          if (itemForm.orderReplacement) {
            const replacement = await supabase.from("costs").insert({
              org_id: orgId,
              category: payload.category,
              vendor: payload.vendor,
              status: itemForm.replacementStatus,
              description: `${name} — replacement for ${wastage} ${payload.unit} wastage`,
              amount: 0,
              cost_type: "one_time",
              incurred_date: todayISO(),
              inventory_item_id: editingItemId,
              quantity_purchased: wastage,
              notes: reason ? `Replacement order — ${reason}` : "Replacement order for wastage",
            });
            if (replacement.error) throw replacement.error;
          }
        }
        return;
      }
      const { data: inserted, error } = await supabase
        .from("inventory_items")
        .insert({ org_id: orgId, ...payload })
        .select("id")
        .single();
      if (error) throw error;
      if (total > 0 && inserted?.id) {
        const stock = await supabase.from("costs").insert({
          org_id: orgId,
          category: payload.category,
          vendor: payload.vendor,
          status: "received",
          description: `${name} — opening stock ${total} ${payload.unit}`,
          amount: 0,
          cost_type: "one_time",
          incurred_date: todayISO(),
          inventory_item_id: inserted.id,
          quantity_purchased: total,
          notes: "Opening stock",
        });
        if (stock.error) throw stock.error;
      }

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
      const typedName = purchaseForm.itemName.trim();
      if (typedName.length < 2) throw new Error("Enter an item name");
      const quantity = Number(purchaseForm.quantity);
      const amount = Number(purchaseForm.amount);
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Enter a valid quantity");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");

      const vendor = purchaseForm.vendor.trim() || null;
      const vendorKey = (vendor ?? "").toLowerCase();
      // Stock is tracked per vendor, so an item is identified by name + category + vendor.
      const matched = allItems.find(
        (row) =>
          row.category === purchaseForm.category &&
          row.name.toLowerCase() === typedName.toLowerCase() &&
          ((row as { vendor?: string | null }).vendor ?? "").trim().toLowerCase() === vendorKey,
      );
      const itemId =
        matched?.id ??
        (await ensureInventoryItem({
          orgId,
          name: typedName,
          category: purchaseForm.category,
          unit: purchaseForm.unit,
          vendor,
        }));
      const unit = matched?.unit || purchaseForm.unit;



      const payload = {
        category: purchaseForm.category,
        vendor,
        status: purchaseForm.status,
        description:
          purchaseForm.description.trim() ||
          `${typedName} purchase — ${quantity} ${unit}${vendor ? ` from ${vendor}` : ""}`.trim(),
        amount,
        cost_type: "one_time",
        incurred_date: purchaseForm.incurredDate,
        inventory_item_id: itemId,
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
        subtitle="Stock on hand and incoming replacements. Fully zeroed items move to the depleted log below."
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Items tracked" value={stock?.length ?? 0} />
        <StatTile label="Stock value" value={fmtMoney(stockValue)} hint="Weighted average cost" />
        <StatTile
          label="On order / replacement"
          value={incomingItems.length}
          hint={
            incomingItems.length
              ? incomingItems
                  .map(
                    (row) =>
                      `${row.name} (${row.qty.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.unit})`,
                  )
                  .join(", ")
              : "Nothing on order or in transit"
          }
        />
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
                <Label>Status</Label>
                <Select value={itemForm.status} onValueChange={(value) => setItem("status", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
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
              <div className="space-y-1.5">
                <Label htmlFor="item-total">Total weight / quantity ({itemForm.unit})</Label>
                <Input
                  id="item-total"
                  inputMode="decimal"
                  value={itemForm.totalQty}
                  onChange={(event) => setItem("totalQty", event.target.value)}
                  placeholder="50"
                />
                <p className="text-xs text-muted-foreground">
                  Everything ever brought in for this item. Used amounts are deducted from this
                  total.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="item-vendor">Vendor (optional)</Label>
                <Input
                  id="item-vendor"
                  maxLength={80}
                  value={itemForm.vendor}
                  onChange={(event) => setItem("vendor", event.target.value)}
                  placeholder="Supplier name"
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
              {editingItemId ? (
                <div className="space-y-3 rounded-lg border border-border p-3 sm:col-span-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="item-wastage">Wastage ({itemForm.unit})</Label>
                      <Input
                        id="item-wastage"
                        inputMode="decimal"
                        value={itemForm.wastageQty}
                        onChange={(event) => setItem("wastageQty", event.target.value)}
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="item-wastage-reason">Reason (optional)</Label>
                      <Input
                        id="item-wastage-reason"
                        maxLength={120}
                        value={itemForm.wastageReason}
                        onChange={(event) => setItem("wastageReason", event.target.value)}
                        placeholder="Contaminated spawn bag"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={itemForm.orderReplacement}
                      onCheckedChange={(checked) => setItem("orderReplacement", checked === true)}
                    />
                    Mark wastage for replacement order
                  </label>
                  {itemForm.orderReplacement ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Replacement status</Label>
                        <Select
                          value={itemForm.replacementStatus}
                          onValueChange={(value) => setItem("replacementStatus", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PURCHASE_STATUSES.map((status) => (
                              <SelectItem key={status.value} value={status.value}>
                                {status.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-end gap-2 text-sm">
                        <span className="text-muted-foreground">Replacement quantity:</span>
                        <span className="font-medium">
                          {(Number(itemForm.wastageQty) || 0).toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {itemForm.unit}
                        </span>
                        <PurchaseStatusBadge status={itemForm.replacementStatus} />
                      </div>
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Wastage is deducted from stock on save. A replacement order is logged as a
                    zero-cost purchase with the chosen status, so it shows as incoming until
                    received.
                  </p>
                </div>
              ) : null}
              {editingItemId ? (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground sm:col-span-2">
                  Used so far:{" "}
                  <span className="font-medium text-foreground">
                    {editingItemUsage.used.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                    {itemForm.unit}
                  </span>{" "}
                  · Remaining after this total:{" "}
                  <span className="font-medium text-foreground">
                    {Math.max(
                      (Number(itemForm.totalQty) || 0) - editingItemUsage.used,
                      0,
                    ).toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                    {itemForm.unit}
                  </span>
                  . If the total equals or drops below the used amount, the item is marked
                  depleted and moves to the log.
                </div>
              ) : null}

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
                <Label>Category</Label>
                <Select
                  value={purchaseForm.category}
                  onValueChange={(value) => {
                    setPurchase("category", value);
                    setPurchase("itemId", "");
                  }}
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
                <Label htmlFor="purchase-item">Item name</Label>
                <Input
                  id="purchase-item"
                  list="purchase-item-options"
                  value={purchaseForm.itemName}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPurchase("itemName", value);
                    const match = categoryItems.find(
                      (item) => item.name.toLowerCase() === value.trim().toLowerCase(),
                    );
                    setPurchase("itemId", match?.id ?? "");
                    if (match?.unit) setPurchase("unit", match.unit);
                  }}
                  placeholder="Paddy straw"
                  required
                />
                <datalist id="purchase-item-options">
                  {categoryItems.map((item) => (
                    <option key={item.id} value={item.name} />
                  ))}
                </datalist>
                {purchaseForm.itemName.trim().length >= 2 && !purchaseForm.itemId ? (
                  <p className="text-xs text-muted-foreground">
                    New {titleCase(purchaseForm.category).toLowerCase()} item — it will be created
                    on save.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="purchase-vendor">Vendor (optional)</Label>
                <Input
                  id="purchase-vendor"
                  list="purchase-vendor-options"
                  value={purchaseForm.vendor}
                  onChange={(event) => setPurchase("vendor", event.target.value)}
                  placeholder="Sharma Traders"
                />
                <datalist id="purchase-vendor-options">
                  {vendorOptions.map((vendor) => (
                    <option key={vendor} value={vendor} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Select
                  value={purchaseForm.unit}
                  onValueChange={(value) => setPurchase("unit", value)}
                  disabled={Boolean(purchaseForm.itemId)}
                >
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
                <Label>Delivery status</Label>
                <Select
                  value={purchaseForm.status}
                  onValueChange={(value) => setPurchase("status", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURCHASE_STATUSES.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Only received purchases count towards stock on hand — ordered and in-transit show
                  as incoming.
                </p>
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
                <Label htmlFor="purchase-qty">Weight / quantity ({purchaseForm.unit})</Label>
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
                    {purchaseForm.unit}
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
        <div>
          <h2 className="font-display text-lg font-semibold">Inventory summary</h2>
          <p className="text-xs text-muted-foreground">
            In-stock and replacement / on-order items. Zeroed items are kept in the depleted log.
            {incomingItems.length ? ` · ${incomingItems.length} incoming` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="spawn-per-bag" className="text-xs text-muted-foreground">
              Spawn per bag (g)
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
          <div className="flex items-center gap-2">
            <Label htmlFor="substrate-per-bag" className="text-xs text-muted-foreground">
              Dry substrate per bag (kg)
            </Label>
            <Input
              id="substrate-per-bag"
              className="h-8 w-24"
              inputMode="decimal"
              value={substratePerBagKg}
              onChange={(event) => {
                const kg = Number(event.target.value);
                if (!Number.isFinite(kg) || kg < 0) return;
                setSubstratePerBagKg(kg);
                window.localStorage.setItem(SUBSTRATE_PER_BAG_STORAGE_KEY, String(kg));
              }}
            />
          </div>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : activeStockRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Package className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {stockRows.length === 0
                ? "No inventory items yet. Add an item, then record your first purchase."
                : "Everything is used up — see the depleted items log below."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeStockRows.map((row) => {
            const remaining = row.remaining;
            const threshold = toNumber(row.reorder_threshold);
            const low = threshold !== null && remaining <= threshold;
            const pending = pendingPurchasesByItem.get(row.inventory_item_id ?? "");
            return (
              <Card key={row.inventory_item_id ?? row.name}>
                <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {titleCase(row.category)}
                        {vendorByItem[row.inventory_item_id ?? ""]
                          ? ` · ${vendorByItem[row.inventory_item_id ?? ""]}`
                          : ""}
                      </p>

                      <div className="mt-1">
                        <ItemStatusBadge status={row.item_status} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {needsReviewItems.has(row.inventory_item_id ?? "") ? (
                        <AlertTriangle
                          className="size-4 shrink-0 text-amber-500"
                          aria-label="Auto-created from a batch — add vendor, quantity and amount"
                        >
                          <title>Auto-created from a batch — add vendor, quantity and amount</title>
                        </AlertTriangle>
                      ) : null}
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
                  {canEdit && remaining <= 0.0001 && pending && pending.qty > 0 ? (
                    <Button
                      size="sm"
                      className="mt-3 w-full"
                      disabled={markInStock.isPending}
                      onClick={() => markInStock.mutate(row.inventory_item_id!)}
                    >
                      <PackageCheck className="size-4" /> Mark in stock (
                      {pending.qty.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {row.unit})
                    </Button>
                  ) : null}
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
                    {(toNumber(row.incoming_qty) ?? 0) > 0 ? (
                      <div>
                        <dt>Incoming</dt>
                        <dd className="text-accent-foreground">
                          {(toNumber(row.incoming_qty) ?? 0).toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {row.unit}
                        </dd>
                      </div>
                    ) : null}
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
                            {(() => {
                              const perBag =
                                row.derivedBags > 0
                                  ? row.derivedUsed / row.derivedBags
                                  : row.category === "spawn"
                                    ? spawnPerBagKg
                                    : substratePerBagKg;
                              return row.category === "spawn"
                                ? `(${(perBag * 1000).toFixed(0)} g per bag)`
                                : `(${perBag.toFixed(2)} kg per bag)`;
                            })()}
                          </span>

                        </dd>
                      </div>
                    ) : null}
                    {(toNumber(row.total_used_qty) ?? 0) > 0 ? (
                      <div className="col-span-2">
                        <dt>Wastage / manual usage</dt>
                        <dd className="text-foreground">
                          {(toNumber(row.total_used_qty) ?? 0).toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}{" "}
                          {row.unit}
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

      {depletedRows.length > 0 ? (
        <>
          <h2 className="mb-3 mt-8 font-display text-lg font-semibold">
            Depleted items{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({depletedRows.length} fully used)
            </span>
          </h2>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {depletedRows.map((row) => {
                  const purchased = toNumber(row.total_purchased_qty) ?? 0;
                  const logged = toNumber(row.total_used_qty) ?? 0;
                  return (
                    <div
                      key={row.inventory_item_id ?? row.name}
                      className="flex items-start justify-between gap-3 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {titleCase(row.category)} · purchased{" "}
                          {purchased.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                          {row.unit} · production use{" "}
                          {row.derivedUsed.toLocaleString("en-IN", { maximumFractionDigits: 2 })}{" "}
                          {row.unit}
                          {logged > 0
                            ? ` · wastage ${logged.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${row.unit}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <div className="text-right">
                          <Badge variant="outline">Out of stock</Badge>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {fmtMoney(row.avg_unit_cost, true)} / {row.unit} avg
                          </p>
                        </div>
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
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {purchaseAnalytics.rows.length > 0 ? (
        <>
          <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">Purchase analytics</h2>
            <p className="text-xs text-muted-foreground">
              {purchaseAnalytics.totalOrders} purchases · {fmtMoney(purchaseAnalytics.totalSpend)}{" "}
              spent
            </p>
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Item</th>
                    <th className="px-4 py-2 text-right font-medium">Orders</th>
                    <th className="px-4 py-2 text-right font-medium">Qty</th>
                    <th className="px-4 py-2 text-right font-medium">Spend</th>
                    <th className="px-4 py-2 text-right font-medium">Avg rate</th>
                    <th className="px-4 py-2 text-right font-medium">Low / high</th>
                    <th className="px-4 py-2 text-right font-medium">Last rate</th>
                    <th className="px-4 py-2 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {purchaseAnalytics.rows.map((row) => {
                    const share =
                      purchaseAnalytics.totalSpend > 0
                        ? (row.spend / purchaseAnalytics.totalSpend) * 100
                        : 0;
                    const delta =
                      row.lastRate !== null && row.avgRate ? row.lastRate - row.avgRate : null;
                    return (
                      <tr key={row.itemId}>
                        <td className="px-4 py-2">
                          <p className="font-medium">{row.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {titleCase(row.category)}
                            {row.lastDate ? ` · last ${fmtDate(row.lastDate)}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-right">{row.orders}</td>
                        <td className="px-4 py-2 text-right">
                          {row.qty.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {row.unit}
                        </td>
                        <td className="px-4 py-2 text-right">{fmtMoney(row.spend)}</td>
                        <td className="px-4 py-2 text-right">
                          {row.avgRate === null ? "—" : `${fmtMoney(row.avgRate, true)}/${row.unit}`}
                        </td>
                        <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                          {row.minRate === null
                            ? "—"
                            : `${fmtMoney(row.minRate, true)} – ${fmtMoney(row.maxRate, true)}`}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {row.lastRate === null ? (
                            "—"
                          ) : (
                            <>
                              {fmtMoney(row.lastRate, true)}
                              {delta !== null && Math.abs(delta) > 0.005 ? (
                                <span
                                  className={
                                    delta > 0
                                      ? "ml-1 text-xs text-destructive"
                                      : "ml-1 text-xs text-primary"
                                  }
                                >
                                  {delta > 0 ? "▲" : "▼"} {fmtMoney(Math.abs(delta), true)}
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{share.toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}

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
                        {titleCase(row.category)}
                        {row.vendor ? ` · ${row.vendor}` : ""} · {fmtDate(row.incurred_date)}
                        {qty ? ` · ${qty} ${unit}` : ""}
                        {row.batches?.batch_code ? ` · ${row.batches.batch_code}` : ""}
                        {row.farms?.name ? ` · ${row.farms.name}` : ""}
                      </p>
                      <div className="mt-1">
                        <PurchaseStatusBadge status={row.status} />
                      </div>
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
