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
export const DEFAULT_SPAWN_PER_BAG_KG = 0.2;
export const SPAWN_PER_BAG_STORAGE_KEY = "sporeveda.spawnPerBagKg";

/** Default dry substrate used per bag, in kg. */
export const DEFAULT_SUBSTRATE_PER_BAG_KG = 1.2;
export const SUBSTRATE_PER_BAG_STORAGE_KEY = "sporeveda.substratePerBagKg";

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

/**
 * Finds an inventory item by name + category for the org, creating it when missing.
 * Returns the inventory item id.
 */
export async function ensureInventoryItem(params: {
  orgId: string;
  name: string;
  category: string;
  unit?: string;
}): Promise<string> {
  const unit = params.unit ?? "kg";
  const existing = await supabase
    .from("inventory_items")
    .select("id")
    .eq("org_id", params.orgId)
    .eq("category", params.category)
    .eq("name", params.name)
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id;

  const created = await supabase
    .from("inventory_items")
    .insert({ org_id: params.orgId, name: params.name, category: params.category, unit })
    .select("id")
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

type LinkRow = {
  inventory_item_id: string | null;
  batch_id: string | null;
  quantity_purchased: number | string | null;
};

/**
 * Derives material consumption per inventory item from production data:
 * spawn is consumed at `spawnPerBagKg` per bag and substrate at `substratePerBagKg`
 * per bag of every linked batch — every bag counts, including discarded ones. When
 * several items supply the same batch, the consumption is split in proportion to the
 * quantity purchased for that batch.
 */
export function deriveUsageByItem(params: {
  costRows: LinkRow[];
  bagsPerBatch: Record<string, number>;
  categoryByItem: Record<string, string>;
  spawnPerBagKg: number;
  substratePerBagKg: number;
}): Record<string, number> {
  const { costRows, bagsPerBatch, categoryByItem, spawnPerBagKg, substratePerBagKg } = params;

  // batchId -> category -> itemId -> purchased qty
  const grouped = new Map<string, Map<string, Map<string, number>>>();
  for (const row of costRows) {
    if (!row.inventory_item_id || !row.batch_id) continue;
    const category = categoryByItem[row.inventory_item_id];
    if (category !== "spawn" && category !== "substrate") continue;
    const qty = Number(row.quantity_purchased ?? 0) || 0;
    const byCategory = grouped.get(row.batch_id) ?? new Map();
    grouped.set(row.batch_id, byCategory);
    const byItem = byCategory.get(category) ?? new Map<string, number>();
    byCategory.set(category, byItem);
    byItem.set(row.inventory_item_id, (byItem.get(row.inventory_item_id) ?? 0) + qty);
  }

  const usage: Record<string, number> = {};
  for (const [batchId, byCategory] of grouped) {
    for (const [category, byItem] of byCategory) {
      const perBag = category === "spawn" ? spawnPerBagKg : substratePerBagKg;
      const consumed = (bagsPerBatch[batchId] ?? 0) * perBag;
      if (consumed <= 0) continue;
      const totalQty = [...byItem.values()].reduce((sum, value) => sum + value, 0);
      const items = [...byItem.entries()];
      for (const [itemId, qty] of items) {
        const share = totalQty > 0 ? qty / totalQty : 1 / items.length;
        usage[itemId] = (usage[itemId] ?? 0) + consumed * share;
      }
    }
  }
  return usage;
}
