# 30-day climate trend charts on each room page

The room detail page already has one combined 30-day line chart with temperature and humidity on two axes. This plan splits that into two dedicated, easier-to-read trend charts and shows target bands on each.

## What changes

On each Grow Room page (`/rooms/<room>`), replace the single combined chart with:

1. **Temperature — last 30 days**
   - Line of daily average temp
   - Faint shaded bands for the room's colonisation and fruiting temperature targets
   - Optional min/max shading when a reading has min/max recorded
   - Dashed line for the 30-day average

2. **Humidity — last 30 days**
   - Same structure using the room's colonisation and fruiting humidity targets

Both charts sit side by side on desktop and stack on mobile. Existing empty-state message ("No environment readings logged in the last 30 days") is kept per chart. The targets summary list underneath and the Target vs actual card stay as they are.

## Technical notes

- File: `src/routes/_authenticated/rooms/$farmId.tsx`.
- The existing `useFarmDetail` query already returns 30 days of readings; extend its mapping to also carry `min_temp_c`, `max_temp_c`, `min_humidity_pct`, `max_humidity_pct` so the range shading works. No new queries.
- Extract a small `ClimateTrendChart` component in the same file (line + `ReferenceArea` bands + `ReferenceLine` average) used twice with different props.
- Colors come from existing tokens (`--color-primary` for temp, `--color-accent` for humidity); no hardcoded colors.
