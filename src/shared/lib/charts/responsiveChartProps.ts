/**
 * The ResponsiveContainer props the app's own charts share. Recharts starts the container at
 * -1×-1 and, until its first measure, logs "The width(-1) and height(-1) of chart should be
 * greater than 0" (#293). Starting at 1×1 keeps the console clean; the first measure replaces it.
 * The database charts carry the same frame in notion-database-sys `chartLayout.ts`.
 */
export const RESPONSIVE_CHART_PROPS = {
  width: "100%",
  height: "100%",
  initialDimension: { width: 1, height: 1 },
} as const;
