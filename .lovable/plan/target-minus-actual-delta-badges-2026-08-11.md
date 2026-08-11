# Target-minus-actual delta badges

Show at a glance how far each room's actual climate is from its target bands.

## How the delta is calculated

For a reading and a target band (min–max):

- Inside the band: shows "In range" (delta 0), green
- Below the minimum: negative delta, e.g. `-1.8°C` (colder than target)
- Above the maximum: positive delta, e.g. `+3.0%` (wetter than target)
- No target set or no reading: shows `—`

Colour follows distance: green in range, amber for a small miss (within 10% of the band width, minimum 1 unit), red beyond that.

## Where the badges appear

1. **Room detail page — Target vs actual card**
   Each of the colonisation and fruiting status chips gains the numeric delta next to the existing In range / Out of range wording, for both temperature and humidity.

2. **Room detail page — stat tiles**
   "Last avg temp" and "Last avg humidity" tiles show a small delta badge against the fruiting target underneath the value.

3. **Grow Rooms list**
   Each room card's "Actual averages" section shows a delta badge next to the average temp and humidity, compared to the fruiting target band (falling back to the legacy target when fruiting is unset).

Deltas on the detail page use the latest reading; deltas on the list use the room's average, and each badge is labelled so it is clear which is which.

## Technical notes

- New shared helper `src/lib/climate.ts` exporting `climateDelta(actual, min, max)` returning `{ status: "in" | "below" | "above" | "unknown", delta: number }`, plus a `DeltaBadge` component in `src/components/DeltaBadge.tsx` that renders the value with semantic token colours (`success`, `warning`/`accent`, `destructive`) — no hardcoded colours.
- Update `src/routes/_authenticated/rooms/$farmId.tsx` (reuse in `TargetVsActual` and the stat tiles) and `src/routes/_authenticated/rooms/index.tsx`.
- No database or query changes; all values already fetched.
