import { lazy } from "react";

import { LEGACY_SECOND_BRAIN_ENABLED } from "@/shared/config/legacySecondBrain";

/**
 * The one lazy boundary into the legacy graph chunk — Home "graph" variant and the
 * graph_view block both go through it. `null` when the build-time gate is off, so
 * callers must render their own fallback and the dynamic import is dead code.
 */
export const LazyLegacyGraphEngineExplorer = LEGACY_SECOND_BRAIN_ENABLED
  ? lazy(() => import("./LegacyGraphEngineExplorer").then((m) => ({ default: m.LegacyGraphEngineExplorer })))
  : null;
