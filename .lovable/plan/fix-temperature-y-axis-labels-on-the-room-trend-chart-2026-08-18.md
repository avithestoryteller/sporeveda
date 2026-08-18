# Fix temperature Y-axis labels on the room trend chart

The Temperature chart on a Grow Room page renders its Y-axis with a fixed narrow width and the `°C` unit glued onto raw, unrounded values. That makes tick labels appear clipped or wrong (e.g. long decimals such as `26.333333°C` squeezed into a 38px gutter, with the chart's negative left margin cutting them further).

## What changes

On `/rooms/<room>` (both the Temperature and Humidity trend charts):

- Round tick values to at most one decimal instead of printing raw averages.
- Give the axis enough width for the value plus unit, and remove the negative left margin that clips labels.
- Keep the unit in the tick formatter (e.g. `26.3°C`, `88%`) so it reads correctly on both charts.
- Make the value domain padded whole-ish numbers so ticks land on sensible values rather than arbitrary data points.

No data, query, or business-logic changes — presentation only.

## Technical notes

- File: `src/routes/_authenticated/rooms/$farmId.tsx`, `ClimateTrendChart`.
- Replace `unit={unit}` with `tickFormatter={(v) => `${Math.round(v * 10) / 10}${unit}`}`, set `width` to ~52, and change the chart `margin.left` from `-18` to `0`.
- Keep `domain={["auto", "auto"]}` but add `allowDecimals` and `tickCount` tuning so the axis shows evenly spaced ticks.
