import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type BagRow = {
  key: string;
  dryWeight: string;
  netWeight: string;
  spawnWeight: string;
  supplementWeight: string;
  inoculationDate: string;
};

export function makeBagRow(defaults: Partial<BagRow> = {}): BagRow {
  return {
    key: crypto.randomUUID(),
    dryWeight: "",
    netWeight: "",
    spawnWeight: "",
    supplementWeight: "",
    inoculationDate: "",
    ...defaults,
  };
}


/** Tabular editor for the bags logged alongside a new batch. */
export function BagRowsEditor({
  rows,
  onChange,
  startNumber = 1,
}: {
  rows: BagRow[];
  onChange: (rows: BagRow[]) => void;
  startNumber?: number;
}) {
  const last = rows[rows.length - 1];

  const update = (key: string, patch: Partial<BagRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Bag #</th>
              <th className="px-2 py-2 text-left font-medium">Dry (kg)</th>
              <th className="px-2 py-2 text-left font-medium">Net (kg)</th>
              <th className="px-2 py-2 text-left font-medium">Spawn (kg)</th>
              <th className="px-2 py-2 text-left font-medium">Supplement (kg)</th>
              <th className="px-2 py-2 text-left font-medium">Start date</th>

              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row, index) => (
              <tr key={row.key}>
                <td className="px-2 py-1.5 text-muted-foreground tabular-nums">
                  {startNumber + index}
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    aria-label={`Dry weight for bag ${startNumber + index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8"
                    value={row.dryWeight}
                    onChange={(event) => update(row.key, { dryWeight: event.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    aria-label={`Net weight for bag ${startNumber + index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8"
                    value={row.netWeight}
                    onChange={(event) => update(row.key, { netWeight: event.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    aria-label={`Spawn weight for bag ${startNumber + index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8"
                    value={row.spawnWeight}
                    onChange={(event) => update(row.key, { spawnWeight: event.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input
                    aria-label={`Supplement weight for bag ${startNumber + index}`}
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-8"
                    value={row.supplementWeight}
                    onChange={(event) => update(row.key, { supplementWeight: event.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Input

                    aria-label={`Start date for bag ${startNumber + index}`}
                    type="date"
                    className="h-8"
                    value={row.inoculationDate}
                    onChange={(event) => update(row.key, { inoculationDate: event.target.value })}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={`Remove bag ${startNumber + index}`}
                    onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-xs text-muted-foreground">
                  No bags logged yet — add rows to create bags with this batch.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() =>
          onChange([
            ...rows,
            makeBagRow(
              last
                ? {
                    dryWeight: last.dryWeight,
                    netWeight: last.netWeight,
                    spawnWeight: last.spawnWeight,
                    inoculationDate: last.inoculationDate,
                  }
                : {},
            ),
          ])
        }
      >
        <Plus className="size-4" /> Add row
      </Button>
    </div>
  );
}
