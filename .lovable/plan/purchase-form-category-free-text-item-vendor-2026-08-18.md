# Purchase form: category, free-text item, vendor

Three fixes to the Record Purchase form on the Inventory page.

## 1. Show and set the category (spawn / substrate / …)

Today the purchase silently inherits the category from the picked inventory item, and nothing on the form says which it is. Add a Category selector at the top of the form (Substrate, Spawn, Packaging, Supplement, Equipment, Other):

- It filters the item list to that category, so you always see whether you are buying spawn or substrate.
- When a new item is created from the form (see below), it is created in the chosen category.
- The saved cost row uses the selected category.
- When editing an existing purchase, the category is pre-filled from the record.

## 2. Item name becomes free to type

Replace the item dropdown with a type-ahead input: typing filters matching items in the selected category, and if the typed name does not exist you can save it as a new item (created with the chosen category, unit defaulting to kg) as part of recording the purchase. Picking an existing item still works with one click.

## 3. New Vendor field

Add a dedicated Vendor field to the purchase form, stored on the purchase record itself, so the item name stays just the item (no more "Vendor — Item").

- Vendor is optional, with suggestions from vendors already used.
- Vendor is shown in the purchase list and included in the auto-generated description when none is typed.
- Existing purchases keep working; their vendor is blank until edited.

## Technical notes

- Migration: add `vendor text` to `public.costs` (nullable, no backfill). Existing GRANTs and RLS policies already cover the column.
- `src/routes/_authenticated/finance/inventory.tsx`: extend `PurchaseForm` with `category` and `vendor`; item picker becomes an input + filtered suggestion list (shadcn Command/Popover, matching existing UI patterns); `addPurchase` creates the item via `ensureInventoryItem` from `src/lib/materials.ts` when the typed name has no match, then writes `vendor` and the selected `category` onto the cost row.
- Purchase edit prefill, the purchase table, and purchase analytics grouping stay keyed on `inventory_item_id`, so stock and usage math are unchanged.
- Item names created here carry no vendor prefix; existing "Vendor — Item" names are left as-is and can be renamed via the item edit tile.
