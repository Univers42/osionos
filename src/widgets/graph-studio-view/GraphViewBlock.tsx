import React, { Suspense } from "react";

import { LEGACY_SECOND_BRAIN_ENABLED } from "@/shared/config/legacySecondBrain";
import { LegacyGraphViewBlock } from "@/widgets/legacy-graph-explorer/LegacyGraphViewBlock";
import { LazyGraphStudioView } from "./lazy";

interface GraphViewBlockProps {
  fallback: React.ReactNode;
}

/**
 * Body of a persisted `graph_view` block (also what an ```osigraph fence imports to).
 * The block's data is unchanged: the legacy graph when the build-time gate is on, the
 * graph_render graph of the active workspace when it is off.
 */
export const GraphViewBlock: React.FC<GraphViewBlockProps> = ({ fallback }) => {
  if (LEGACY_SECOND_BRAIN_ENABLED) return <LegacyGraphViewBlock fallback={fallback} />;
  return (
    <Suspense fallback={fallback}>
      <LazyGraphStudioView scope="workspace" />
    </Suspense>
  );
};
