/**
 * Produce inventory: mushrooms harvested from fruiting bags.
 *
 * Fresh stock is derived from logged harvests (wet weight) for a species.
 * Dried stock is created by logging a drying conversion, which is stored as a
 * zero-amount received cost row against the dried produce item (same pattern the
 * rest of the inventory uses for stock additions).
 * Both forms are reduced by sales (revenue linked to the item) and by wastage /
 * contamination entries recorded in inventory_usage.
 */

export const PRODUCE_CATEGORY = "produce";
export const PRODUCE_FORMS = ["fresh", "dried"] as const;
export type ProduceForm = (typeof PRODUCE_FORMS)[number];

export const PRODUCE_LOSS_REASONS = [
  "wastage",
  "contamination",
  "spoilage",
  "sampling",
  "other",
] as const;

export const DRYING_NOTE = "Dried from fresh produce";

export function produceItemName(speciesName: string, form: ProduceForm) {
  return `${speciesName} — ${form === "fresh" ? "Fresh" : "Dried"}`;
}

export type ProduceItemRow = {
  id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  species_id: string | null;
  unit: string | null;
};

export type ProduceStock = {
  item: ProduceItemRow;
  form: ProduceForm;
  speciesName: string;
  harvestedKg: number;
  addedKg: number;
  soldKg: number;
  lostKg: number;
  availableKg: number;
};

type Inputs = {
  items: ProduceItemRow[];
  speciesNames: Record<string, string>;
  /** kg of fresh harvest per species id */
  harvestKgBySpecies: Record<string, number>;
  /** kg added to an item through drying / adjustments */
  addedKgByItem: Record<string, number>;
  /** kg sold per item id */
  soldKgByItem: Record<string, number>;
  /** kg written off per item id */
  lostKgByItem: Record<string, number>;
};

export function deriveProduceStock({
  items,
  speciesNames,
  harvestKgBySpecies,
  addedKgByItem,
  soldKgByItem,
  lostKgByItem,
}: Inputs): ProduceStock[] {
  return items
    .map((item) => {
      const form: ProduceForm = item.subcategory === "dried" ? "dried" : "fresh";
      const harvestedKg =
        form === "fresh" && item.species_id ? (harvestKgBySpecies[item.species_id] ?? 0) : 0;
      const addedKg = addedKgByItem[item.id] ?? 0;
      const soldKg = soldKgByItem[item.id] ?? 0;
      const lostKg = lostKgByItem[item.id] ?? 0;
      return {
        item,
        form,
        speciesName: (item.species_id && speciesNames[item.species_id]) || item.name,
        harvestedKg,
        addedKg,
        soldKg,
        lostKg,
        availableKg: Math.max(0, harvestedKg + addedKg - soldKg - lostKg),
      };
    })
    .sort(
      (a, b) =>
        a.speciesName.localeCompare(b.speciesName) || a.form.localeCompare(b.form),
    );
}
