import * as XLSX from "xlsx";

import { supabase } from "@/integrations/supabase/client";

export type RoomReportOptions = {
  orgId: string;
  farmId: string;
  roomName: string;
  from: string;
  to: string;
};

const label = (value: unknown) => (value === null || value === undefined ? "" : value);

function autoWidth(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return undefined;
  return Object.keys(rows[0]!).map((key) => ({
    wch: Math.min(
      40,
      Math.max(key.length, ...rows.map((row) => String(label(row[key])).length)) + 2,
    ),
  }));
}

function addSheet(
  book: XLSX.WorkBook,
  name: string,
  rows: Record<string, unknown>[],
) {
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ note: "No rows in this period" }]);
  if (rows.length) sheet["!cols"] = autoWidth(rows);
  XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
}

/** Fetch every dataset for one room and download it as a single .xlsx workbook. */
export async function downloadRoomReport({ orgId, farmId, roomName, from, to }: RoomReportOptions) {
  const [room, readings, batches, bags, harvests, contamination] = await Promise.all([
    supabase.from("farms").select("*").eq("id", farmId).single(),
    supabase
      .from("environment_readings")
      .select("*")
      .eq("org_id", orgId)
      .eq("farm_id", farmId)
      .gte("reading_date", from)
      .lte("reading_date", to)
      .order("reading_date", { ascending: false }),
    supabase
      .from("batches")
      .select("*, species(common_name)")
      .eq("org_id", orgId)
      .eq("farm_id", farmId)
      .gte("inoculation_date", from)
      .lte("inoculation_date", to)
      .order("inoculation_date", { ascending: false }),
    supabase
      .from("bags")
      .select("*, batches(batch_code, substrate_type), species(common_name)")
      .eq("org_id", orgId)
      .eq("farm_id", farmId)
      .order("bag_number"),
    supabase
      .from("harvests")
      .select("*, bags!inner(bag_code, farm_id, batches(batch_code), species(common_name))")
      .eq("org_id", orgId)
      .eq("bags.farm_id", farmId)
      .gte("harvest_date", from)
      .lte("harvest_date", to)
      .order("harvest_date", { ascending: false }),
    supabase
      .from("contamination_events")
      .select("*, bags!inner(bag_code, farm_id, batches(batch_code), species(common_name))")
      .eq("org_id", orgId)
      .eq("bags.farm_id", farmId)
      .gte("detected_at", `${from}T00:00:00Z`)
      .lte("detected_at", `${to}T23:59:59Z`)
      .order("detected_at", { ascending: false }),
  ]);

  for (const result of [room, readings, batches, bags, harvests, contamination]) {
    if (result.error) throw result.error;
  }

  const book = XLSX.utils.book_new();
  const roomRow = room.data;
  if (!roomRow) throw new Error("Room not found");

  addSheet(book, "Room summary", [
    { field: "Room", value: label(roomRow.name) },
    { field: "Report period", value: `${from} to ${to}` },
    { field: "Location", value: label(roomRow.location_notes) },
    { field: "Colonisation temp target (°C)", value: `${label(roomRow.target_colonization_temp_min)} – ${label(roomRow.target_colonization_temp_max)}` },
    { field: "Colonisation humidity target (%)", value: `${label(roomRow.target_colonization_humidity_min_pct)} – ${label(roomRow.target_colonization_humidity_max_pct)}` },
    { field: "Fruiting temp target (°C)", value: `${label(roomRow.target_fruiting_temp_min)} – ${label(roomRow.target_fruiting_temp_max)}` },
    { field: "Fruiting humidity target (%)", value: `${label(roomRow.target_fruiting_humidity_min_pct)} – ${label(roomRow.target_fruiting_humidity_max_pct)}` },
  ]);

  addSheet(
    book,
    "Environment readings",
    (readings.data ?? []).map((row) => ({
      reading_date: label(row.reading_date),
      avg_temp_c: label(row.avg_temp_c),
      min_temp_c: label(row.min_temp_c),
      max_temp_c: label(row.max_temp_c),
      avg_humidity_pct: label(row.avg_humidity_pct),
      min_humidity_pct: label(row.min_humidity_pct),
      max_humidity_pct: label(row.max_humidity_pct),
      source: label(row.source),
      notes: label(row.notes),
    })),
  );

  addSheet(
    book,
    "Batches",
    (batches.data ?? []).map((row) => ({
      batch_code: label(row.batch_code),
      species: label(row.species?.common_name),
      inoculation_date: label(row.inoculation_date),
      substrate_type: label(row.substrate_type),
      substrate_vendor: label(row.substrate_vendor),
      spawn_vendor: label(row.spawn_vendor),
      dry_substrate_weight_kg: label(row.dry_substrate_weight_kg),
      notes: label(row.notes),
    })),
  );

  addSheet(
    book,
    "Bags",
    (bags.data ?? []).map((row) => ({
      bag_code: label(row.bag_code),
      bag_number: label(row.bag_number),
      batch_code: label(row.batches?.batch_code),
      species: label(row.species?.common_name),
      substrate_type: label(row.batches?.substrate_type),
      current_stage: label(row.current_stage),
      is_discarded: row.is_discarded ? "yes" : "no",
      prep_date: label(row.prep_date),
      inoculation_date: label(row.inoculation_date),
      pinning_date: label(row.pinning_date),
      spawn_weight_kg: label(row.spawn_weight_kg),
      dry_weight_kg: label(row.dry_weight_kg),
      net_weight_kg: label(row.net_weight_kg),
      supplement_weight_kg: label(row.supplement_weight_kg),
      notes: label(row.notes),
    })),
  );

  addSheet(
    book,
    "Harvests",
    (harvests.data ?? []).map((row) => ({
      harvest_date: label(row.harvest_date),
      bag_code: label(row.bags?.bag_code),
      batch_code: label(row.bags?.batches?.batch_code),
      species: label(row.bags?.species?.common_name),
      flush_number: label(row.flush_number),
      wet_weight_g: label(row.wet_weight_g),
      notes: label(row.notes),
    })),
  );

  addSheet(
    book,
    "Contamination",
    (contamination.data ?? []).map((row) => ({
      detected_at: label(row.detected_at),
      bag_code: label(row.bags?.bag_code),
      batch_code: label(row.bags?.batches?.batch_code),
      species: label(row.bags?.species?.common_name),
      severity: label(row.severity),
      contaminant_type: label(row.contaminant_type),
      action_taken: label(row.action_taken),
      notes: label(row.notes),
    })),
  );

  const safeName = roomName.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  XLSX.writeFile(book, `room_report_${safeName}_${from}_to_${to}.xlsx`);
}
