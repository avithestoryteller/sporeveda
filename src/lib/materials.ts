import { supabase } from "@/integrations/supabase/client";

/** Categories whose cost entries are logged as material line items feeding inventory. */
export const MATERIAL_CATEGORIES = ["substrate", "spawn"] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export const VARIETY_SUGGESTIONS: Record<MaterialCategory, string[]> = {
  spawn: [
    "White Oyster",
    "Pink Oyster",
    "Grey Oyster",
    "Golden Oyster",
    "Blue Oyster",
    "Milky",
    "Shiitake",
    "Button",
  ],
  substrate: ["Paddy Straw", "Rubber Wood", "Sawdust", "Wheat Straw", "Coco Coir", "Sugarcane Bagasse"],
};

/** Default spawn used per bag, in kg. */
export const DEFAULT_SPAWN_PER_BAG_KG = 0.25;
export const SPAWN_PER_BAG_STORAGE_KEY = "sporeveda.spawnPerBagKg.v2";

/** Default dry substrate used per bag, in kg. */
export const DEFAULT_SUBSTRATE_PER_BAG_KG = 1.25;
export const SUBSTRATE_PER_BAG_STORAGE_KEY = "sporeveda.substratePerBagKg.v3";

/** Weight of one empty PP grow bag, in grams (1 kg ≈ 142 bags). */
export const DEFAULT_PP_BAG_WEIGHT_G = 7;
export const PP_BAG_WEIGHT_STORAGE_KEY = "sporeveda.ppBagWeightG.v1";

/** Default supplement (e.g. wheat bran) used per bag, in kg. */
export const DEFAULT_SUPPLEMENT_PER_BAG_KG = 0.35;
export const SUPPLEMENT_PER_BAG_STORAGE_KEY = "sporeveda.supplementPerBagKg.v1";

/** True when an inventory item represents empty PP / poly grow bags. */
export function isPackagingBagItem(name: string | null | undefined) {
  const value = (name ?? "").toLowerCase();
  return /(\bpp\b|poly\s*|grow\s*)?bags?\b/.test(value) && /\bpp\b|poly|grow/.test(value);
}

/** True when an inventory item is a supplement (bran / supplement additives). */
export function isSupplementItem(name: string | null | undefined) {
  const value = (name ?? "").toLowerCase();
  return /\bbran\b|supplement/.test(value);
}

/**
 * Consumption of supplement stock (e.g. wheat bran) derived from the supplement
 * weight logged on each bag. Usage fills each supplement item up to the quantity
 * purchased before spilling over to the next; any shortfall lands on the last item
 * so a deficit stays visible.
 */
export function deriveSupplementUsage(params: {
  items: { id: string; name: string | null; purchased: number }[];
  totalSupplementKg: number;
}): Record<string, UsageDetail> {
  const usage: Record<string, UsageDetail> = {};
  let remaining = params.totalSupplementKg;
  if (!(remaining > 0)) return usage;
  const pool = params.items.filter((item) => isSupplementItem(item.name));
  if (pool.length === 0) return usage;

  for (const item of pool) {
    if (remaining <= 0) break;
    const capacity = item.purchased > 0 ? item.purchased : Infinity;
    const qty = Math.min(remaining, capacity);
    usage[item.id] = { qty, bags: 0 };
    remaining -= qty;
  }
  if (remaining > 0) {
    const last = pool[pool.length - 1]!;
    const entry = usage[last.id] ?? { qty: 0, bags: 0 };
    entry.qty += remaining;
    usage[last.id] = entry;
  }
  return usage;
}


/**
 * Consumption of empty PP bag stock derived from production: every bag ever
 * created (including discarded ones) consumes one empty bag. Usage is spread
 * across matching PP-bag inventory items, filling each item up to the quantity
 * purchased before spilling over to the next.
 */
export function derivePackagingUsage(params: {
  items: { id: string; name: string | null; purchased: number }[];
  totalBags: number;
  gramsPerBag: number;
}): Record<string, UsageDetail> {
  const usage: Record<string, UsageDetail> = {};
  const perBagKg = params.gramsPerBag / 1000;
  if (perBagKg <= 0 || params.totalBags <= 0) return usage;
  const pool = params.items.filter((item) => isPackagingBagItem(item.name));
  if (pool.length === 0) return usage;

  let remainingBags = params.totalBags;
  for (const item of pool) {
    if (remainingBags <= 0) break;
    const capacityBags = item.purchased > 0 ? item.purchased / perBagKg : Infinity;
    const bags = Math.min(remainingBags, capacityBags);
    usage[item.id] = { qty: bags * perBagKg, bags };
    remainingBags -= bags;
  }
  // Any overflow lands on the last item so the shortfall stays visible.
  if (remainingBags > 0 && pool.length) {
    const last = pool[pool.length - 1]!;
    const entry = usage[last.id] ?? { qty: 0, bags: 0 };
    entry.qty += remainingBags * perBagKg;
    entry.bags += remainingBags;
    usage[last.id] = entry;
  }
  return usage;
}


export type MaterialLine = {
  name: string;
  variety: string;
  quantity: string;
  amount: string;
};

export const EMPTY_LINE: MaterialLine = { name: "", variety: "", quantity: "", amount: "" };

/** Inventory item display name for a material line. */
export function materialItemName(name: string, variety: string) {
  const base = name.trim();
  const v = variety.trim();
  return v ? `${base} — ${v}` : base;
}

/** Normalised name used to decide whether two inventory items are the same material. */
function materialKey(name: string | null | undefined) {
  return (name ?? "")
    .toLowerCase()
    .replace(/[—–-]/g, " ")
    .replace(/\b(spawn|substrate|pellets?|grain|bags?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Finds an inventory item by name + category for the org, creating it when missing.
 * Matching ignores filler words such as "Spawn"/"Pellets" so "Shiitake" and
 * "Shiitake Spawn" from the same vendor are treated as one item.
 * Returns the inventory item id.
 */
export async function ensureInventoryItem(params: {
  orgId: string;
  name: string;
  category: string;
  unit?: string;
  vendor?: string | null;
}): Promise<string> {
  const unit = params.unit ?? "kg";
  const vendor = params.vendor?.trim() || null;
  // Stock is tracked per vendor: same material from another vendor is its own item.
  const existing = await supabase
    .from("inventory_items")
    .select("id, name, vendor")
    .eq("org_id", params.orgId)
    .eq("category", params.category);
  if (existing.error) throw existing.error;
  const key = materialKey(params.name);
  const rows = (existing.data ?? []).filter(
    (row) => row.name === params.name || (key.length > 1 && materialKey(row.name) === key),
  );
  const sameVendor = rows.find(
    (row) => (row.vendor ?? "").trim().toLowerCase() === (vendor ?? "").toLowerCase(),
  );
  if (sameVendor) return sameVendor.id;
  // Backfill an existing vendor-less item rather than duplicating it.
  const vendorless = vendor ? rows.find((row) => !row.vendor) : undefined;
  if (vendorless) {
    await supabase.from("inventory_items").update({ vendor }).eq("id", vendorless.id);
    return vendorless.id;
  }


  const created = await supabase
    .from("inventory_items")
    .insert({
      org_id: params.orgId,
      name: params.name,
      category: params.category,
      unit,
      vendor,
    })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}


/** Quantity of an inventory item currently on hand, counting received purchases only. */
export async function availableStock(itemId: string): Promise<number> {
  const [purchases, usage] = await Promise.all([
    supabase
      .from("costs")
      .select("quantity_purchased, status")
      .eq("inventory_item_id", itemId),
    supabase.from("inventory_usage").select("quantity_used").eq("inventory_item_id", itemId),
  ]);
  if (purchases.error) throw purchases.error;
  if (usage.error) throw usage.error;
  const bought = (purchases.data ?? [])
    .filter((row) => (row.status ?? "received") === "received")
    .reduce((sum, row) => sum + (Number(row.quantity_purchased) || 0), 0);
  const used = (usage.data ?? []).reduce((sum, row) => sum + (Number(row.quantity_used) || 0), 0);
  return bought - used;
}

export type MaterialCheck = {
  category: MaterialCategory;
  name: string;
  itemId: string;
  available: number;
  required: number;
  createdPurchase: boolean;
};

/**
 * Links a batch's substrate/spawn to inventory. When the named material has no
 * inventory item or no stock on hand, a draft purchase is created (status
 * `ordered`, zero amount) so the shortfall is visible and editable.
 */
export async function reconcileMaterialForBatch(params: {
  orgId: string;
  category: MaterialCategory;
  name: string;
  vendor?: string | null;
  batchId: string;
  batchCode: string;
  farmId: string | null;
  requiredQty: number;
}): Promise<MaterialCheck | null> {
  const name = params.name.trim();
  if (name.length < 2) return null;
  const vendor = params.vendor?.trim() || null;

  const itemId = await ensureInventoryItem({
    orgId: params.orgId,
    name,
    category: params.category,
    unit: "kg",
    vendor,
  });
  const available = await availableStock(itemId);
  if (available > 0) {
    return {
      category: params.category,
      name,
      itemId,
      available,
      required: params.requiredQty,
      createdPurchase: false,
    };
  }

  // Never stack duplicate drafts for the same item on the same batch.
  const existingLink = await supabase
    .from("costs")
    .select("id")
    .eq("inventory_item_id", itemId)
    .eq("batch_id", params.batchId)
    .limit(1);
  if (existingLink.error) throw existingLink.error;
  if ((existingLink.data ?? []).length) {
    return {
      category: params.category,
      name,
      itemId,
      available,
      required: params.requiredQty,
      createdPurchase: false,
    };
  }

  const qty = params.requiredQty > 0 ? Number(params.requiredQty.toFixed(3)) : 0;

  const { error } = await supabase.from("costs").insert({
    org_id: params.orgId,
    category: params.category,
    vendor,
    status: "ordered",
    description: `${name} for batch ${params.batchCode}${vendor ? ` — ${vendor}` : ""}`,
    amount: 0,
    cost_type: "one_time",
    incurred_date: new Date().toISOString().slice(0, 10),
    inventory_item_id: itemId,
    quantity_purchased: qty,
    farm_id: params.farmId,
    batch_id: params.batchId,
    notes: "Auto-created from a new batch — add the vendor, quantity and amount.",
  });
  if (error) throw error;

  return {
    category: params.category,
    name,
    itemId,
    available,
    required: params.requiredQty,
    createdPurchase: true,
  };
}


type LinkRow = {
  inventory_item_id: string | null;
  batch_id: string | null;
  quantity_purchased: number | string | null;
};

export type BatchMaterialRow = {
  id: string;
  substrate_type?: string | null;
  substrate_vendor?: string | null;
  spawn_vendor?: string | null;
  species?: { common_name?: string | null } | null;
};

export type InventoryItemRow = {
  id: string;
  name: string | null;
  category: string | null;
  vendor?: string | null;
};

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** Loose name match: either string contains the other (after normalising). */
function nameMatches(a: string, b: string) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Finds the inventory item that most likely supplied a batch for a category when no
 * purchase row is explicitly linked to the batch: match the recorded material name
 * (substrate type / species for spawn), then the vendor, then fall back to the only
 * item in that category.
 */
export function resolveItemForBatch(
  batch: BatchMaterialRow,
  category: MaterialCategory,
  items: InventoryItemRow[],
): string | null {
  const pool = items.filter((item) => norm(item.category) === category);
  if (pool.length === 0) return null;

  const material =
    category === "substrate" ? norm(batch.substrate_type) : norm(batch.species?.common_name);
  const vendor = category === "substrate" ? norm(batch.substrate_vendor) : norm(batch.spawn_vendor);

  if (material) {
    const byName = pool.filter((item) => nameMatches(norm(item.name), material));
    if (byName.length) {
      const withVendor = vendor
        ? byName.find(
            (item) => nameMatches(norm(item.vendor), vendor) || nameMatches(norm(item.name), vendor),
          )
        : undefined;
      return (withVendor ?? byName[0]!).id;
    }
  }

  if (vendor) {
    const byVendor = pool.find((item) => nameMatches(norm(item.vendor), vendor));
    if (byVendor) return byVendor.id;
  }

  if (pool.length === 1) return pool[0]!.id;

  return null;
}

/** Actual logged material weight per batch, with a count of bags missing a logged weight. */
export type BatchWeights = {
  spawnKg: number;
  spawnMissingBags: number;
  substrateKg: number;
  substrateMissingBags: number;
};

export type UsageDetail = { qty: number; bags: number };

/**
 * Derives material consumption per inventory item from production data. When bags
 * carry logged spawn / dry-substrate weights those actual weights are used; bags
 * without a logged weight fall back to `spawnPerBagKg`, and to `substratePerBagKg`
 * only for paddy straw batches (other substrates count logged weights only).
 * Every bag counts, including discarded ones. Items linked to the batch through
 * purchase rows split the consumption in proportion to the quantity purchased for
 * that batch; batches with no linked purchase fall back to the inventory item
 * matching the batch's recorded substrate / species / vendor.
 */
export function deriveUsageDetailByItem(params: {
  costRows: LinkRow[];
  bagsPerBatch: Record<string, number>;
  categoryByItem: Record<string, string>;
  spawnPerBagKg: number;
  substratePerBagKg: number;
  weightsPerBatch?: Record<string, BatchWeights>;
  batches?: BatchMaterialRow[];
  items?: InventoryItemRow[];
}): Record<string, UsageDetail> {
  const { costRows, bagsPerBatch, categoryByItem, spawnPerBagKg, substratePerBagKg } = params;
  const batches = params.batches ?? [];
  const items = params.items ?? [];
  const weights = params.weightsPerBatch ?? {};
  // The substrate-per-bag fallback only applies to paddy straw batches; other
  // substrates rely on logged bag weights only.
  const paddyByBatch = new Map<string, boolean>(
    batches.map((batch) => [batch.id, materialKey(batch.substrate_type).includes("paddy")]),
  );

  // batchId -> category -> itemId -> purchased qty
  const grouped = new Map<string, Map<string, Map<string, number>>>();
  const ensure = (batchId: string, category: string) => {
    const byCategory = grouped.get(batchId) ?? new Map<string, Map<string, number>>();
    grouped.set(batchId, byCategory);
    const byItem = byCategory.get(category) ?? new Map<string, number>();
    byCategory.set(category, byItem);
    return byItem;
  };

  for (const row of costRows) {
    if (!row.inventory_item_id || !row.batch_id) continue;
    const category = categoryByItem[row.inventory_item_id];
    if (category !== "spawn" && category !== "substrate") continue;
    const qty = Number(row.quantity_purchased ?? 0) || 0;
    const byItem = ensure(row.batch_id, category);
    byItem.set(row.inventory_item_id, (byItem.get(row.inventory_item_id) ?? 0) + qty);
  }

  // Fallback mapping for batches without a purchase row linked to them.
  for (const batch of batches) {
    if (!bagsPerBatch[batch.id]) continue;
    for (const category of MATERIAL_CATEGORIES) {
      if (grouped.get(batch.id)?.get(category)?.size) continue;
      const itemId = resolveItemForBatch(batch, category, items);
      if (!itemId) continue;
      ensure(batch.id, category).set(itemId, 1);
    }
  }

  const usage: Record<string, UsageDetail> = {};
  for (const [batchId, byCategory] of grouped) {
    const bags = bagsPerBatch[batchId] ?? 0;
    for (const [category, byItem] of byCategory) {
      const logged = weights[batchId];
      const perBag = category === "spawn" ? spawnPerBagKg : substratePerBagKg;
      let consumed: number;
      if (logged) {
        const actual = category === "spawn" ? logged.spawnKg : logged.substrateKg;
        const missing =
          category === "spawn" ? logged.spawnMissingBags : logged.substrateMissingBags;
        const fallback =
          category === "substrate" && paddyByBatch.get(batchId) === false ? 0 : perBag;
        consumed = actual + missing * fallback;
      } else {
        consumed =
          category === "substrate" && paddyByBatch.get(batchId) === false
            ? 0
            : bags * perBag;
      }
      if (consumed <= 0) continue;
      const totalQty = [...byItem.values()].reduce((sum, value) => sum + value, 0);
      const items2 = [...byItem.entries()];
      for (const [itemId, qty] of items2) {
        const share = totalQty > 0 ? qty / totalQty : 1 / items2.length;
        const entry = usage[itemId] ?? { qty: 0, bags: 0 };
        entry.qty += consumed * share;
        entry.bags += bags * share;
        usage[itemId] = entry;
      }
    }
  }
  return usage;
}

/** Consumed quantity per inventory item. See {@link deriveUsageDetailByItem}. */
export function deriveUsageByItem(params: Parameters<typeof deriveUsageDetailByItem>[0]) {
  const detail = deriveUsageDetailByItem(params);
  const usage: Record<string, number> = {};
  for (const [itemId, value] of Object.entries(detail)) usage[itemId] = value.qty;
  return usage;
}


