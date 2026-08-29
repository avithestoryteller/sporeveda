import Papa from "papaparse";

/** Trigger a browser download of rows as CSV, escaped by papaparse. */
export function downloadCsv(rows: Record<string, unknown>[], dataType: string) {
  const csv = Papa.unparse(rows, { quotes: false, newline: "\r\n" });
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${dataType}_export_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type ExportFilters = {
  from: string;
  to: string;
  farmId: string | null;
  speciesId: string | null;
};

export type DatasetKey =
  | "bags"
  | "batches"
  | "harvests"
  | "contamination_events"
  | "environment_readings"
  | "costs"
  | "revenue"
  | "inventory_items"
  | "inventory_usage";

export type DatasetDef = {
  key: DatasetKey;
  label: string;
  table: string;
  select: string;
  /** Column used for the date-range filter, if any. */
  dateColumn: string | null;
  /** Path to the farm id for room filtering (null = not filterable by room). */
  farmColumn: string | null;
  speciesColumn: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: (row: any) => Record<string, unknown>;
};

const label = (value: unknown) => (value === null || value === undefined ? "" : value);

export const DATASETS: DatasetDef[] = [
  {
    key: "bags",
    label: "Bags",
    table: "bags",
    select:
      "*, batches(batch_code, substrate_type), farms(name), species(common_name, scientific_name)",
    dateColumn: "created_at",
    farmColumn: "farm_id",
    speciesColumn: "species_id",
    map: (row) => ({
      bag_code: label(row.bag_code),
      bag_number: label(row.bag_number),
      batch_code: label(row.batches?.batch_code),
      room: label(row.farms?.name),
      species: label(row.species?.common_name),
      scientific_name: label(row.species?.scientific_name),
      substrate_type: label(row.batches?.substrate_type),
      current_stage: label(row.current_stage),
      is_discarded: row.is_discarded ? "yes" : "no",
      inoculation_date: label(row.inoculation_date),
      pinning_date: label(row.pinning_date),
      spawn_weight_kg: label(row.spawn_weight_kg),
      dry_weight_kg: label(row.dry_weight_kg),
      net_weight_kg: label(row.net_weight_kg),
      notes: label(row.notes),
      created_at: label(row.created_at),
    }),
  },
  {
    key: "batches",
    label: "Batches",
    table: "batches",
    select: "*, farms(name), species(common_name)",
    dateColumn: "inoculation_date",
    farmColumn: "farm_id",
    speciesColumn: "species_id",
    map: (row) => ({
      batch_code: label(row.batch_code),
      room: label(row.farms?.name),
      species: label(row.species?.common_name),
      inoculation_date: label(row.inoculation_date),
      substrate_type: label(row.substrate_type),
      substrate_vendor: label(row.substrate_vendor),
      spawn_vendor: label(row.spawn_vendor),
      dry_substrate_weight_kg: label(row.dry_substrate_weight_kg),
      target_avg_temp_c: label(row.target_avg_temp_c),
      target_avg_humidity_pct: label(row.target_avg_humidity_pct),
      notes: label(row.notes),
      created_at: label(row.created_at),
    }),
  },
  {
    key: "harvests",
    label: "Harvests",
    table: "harvests",
    select:
      "*, bags(bag_code, farm_id, species_id, batches(batch_code), farms(name), species(common_name))",
    dateColumn: "harvest_date",
    farmColumn: "bags.farm_id",
    speciesColumn: "bags.species_id",
    map: (row) => ({
      harvest_date: label(row.harvest_date),
      bag_code: label(row.bags?.bag_code),
      batch_code: label(row.bags?.batches?.batch_code),
      room: label(row.bags?.farms?.name),
      species: label(row.bags?.species?.common_name),
      flush_number: label(row.flush_number),
      wet_weight_g: label(row.wet_weight_g),
      notes: label(row.notes),
    }),
  },
  {
    key: "contamination_events",
    label: "Contamination events",
    table: "contamination_events",
    select:
      "*, bags(bag_code, farm_id, species_id, batches(batch_code), farms(name), species(common_name))",
    dateColumn: "detected_at",
    farmColumn: "bags.farm_id",
    speciesColumn: "bags.species_id",
    map: (row) => ({
      detected_at: label(row.detected_at),
      bag_code: label(row.bags?.bag_code),
      batch_code: label(row.bags?.batches?.batch_code),
      room: label(row.bags?.farms?.name),
      species: label(row.bags?.species?.common_name),
      severity: label(row.severity),
      contaminant_type: label(row.contaminant_type),
      action_taken: label(row.action_taken),
      notes: label(row.notes),
    }),
  },
  {
    key: "environment_readings",
    label: "Environment readings",
    table: "environment_readings",
    select: "*, farms(name)",
    dateColumn: "reading_date",
    farmColumn: "farm_id",
    speciesColumn: null,
    map: (row) => ({
      reading_date: label(row.reading_date),
      room: label(row.farms?.name),
      avg_temp_c: label(row.avg_temp_c),
      min_temp_c: label(row.min_temp_c),
      max_temp_c: label(row.max_temp_c),
      avg_humidity_pct: label(row.avg_humidity_pct),
      min_humidity_pct: label(row.min_humidity_pct),
      max_humidity_pct: label(row.max_humidity_pct),
      source: label(row.source),
      notes: label(row.notes),
    }),
  },
  {
    key: "costs",
    label: "Costs",
    table: "costs",
    select: "*, farms(name), batches(batch_code), inventory_items(name, category, unit)",
    dateColumn: "incurred_date",
    farmColumn: "farm_id",
    speciesColumn: null,
    map: (row) => ({
      incurred_date: label(row.incurred_date),
      category: label(row.category),
      description: label(row.description),
      amount: label(row.amount),
      cost_type: label(row.cost_type),
      recurrence_interval: label(row.recurrence_interval),
      status: label(row.status),
      vendor: label(row.vendor),
      quantity_purchased: label(row.quantity_purchased),
      inventory_item: label(row.inventory_items?.name),
      inventory_category: label(row.inventory_items?.category),
      inventory_unit: label(row.inventory_items?.unit),
      room: label(row.farms?.name),
      batch_code: label(row.batches?.batch_code),
      notes: label(row.notes),
    }),
  },
  {
    key: "revenue",
    label: "Revenue",
    table: "revenue",
    select: "*, farms(name), batches(batch_code), species(common_name)",
    dateColumn: "sale_date",
    farmColumn: "farm_id",
    speciesColumn: "species_id",
    map: (row) => ({
      sale_date: label(row.sale_date),
      buyer: label(row.buyer),
      species: label(row.species?.common_name),
      quantity_kg: label(row.quantity_kg),
      price_per_kg: label(row.price_per_kg),
      amount: label(row.amount),
      payment_method: label(row.payment_method),
      room: label(row.farms?.name),
      batch_code: label(row.batches?.batch_code),
      notes: label(row.notes),
    }),
  },
  {
    key: "inventory_items",
    label: "Inventory items",
    table: "inventory_items",
    select: "*",
    dateColumn: "created_at",
    farmColumn: null,
    speciesColumn: null,
    map: (row) => ({
      name: label(row.name),
      category: label(row.category),
      unit: label(row.unit),
      status: label(row.status),
      vendor: label(row.vendor),
      reorder_threshold: label(row.reorder_threshold),
      notes: label(row.notes),
      created_at: label(row.created_at),
    }),
  },
  {
    key: "inventory_usage",
    label: "Inventory usage",
    table: "inventory_usage",
    select: "*, inventory_items(name, category, unit, vendor), batches(batch_code)",
    dateColumn: "used_date",
    farmColumn: null,
    speciesColumn: null,
    map: (row) => ({
      used_date: label(row.used_date),
      inventory_item: label(row.inventory_items?.name),
      category: label(row.inventory_items?.category),
      vendor: label(row.inventory_items?.vendor),
      quantity_used: label(row.quantity_used),
      unit: label(row.inventory_items?.unit),
      batch_code: label(row.batches?.batch_code),
      notes: label(row.notes),
    }),
  },
];
