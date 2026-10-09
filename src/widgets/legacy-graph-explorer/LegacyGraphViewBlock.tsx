import React, { Suspense } from "react";

import { LazyLegacyGraphEngineExplorer } from "./lazy";

interface LegacyGraphViewBlockProps {
  fallback: React.ReactNode;
}

/**
 * Body of a persisted `graph_view` block. With the legacy gate off the block is
 * kept as-is in the page (no data loss) and renders an inert notice instead.
 */
export const LegacyGraphViewBlock: React.FC<LegacyGraphViewBlockProps> = ({ fallback }) => {
  if (!LazyLegacyGraphEngineExplorer) {
    return (
      <div className="flex h-full min-h-[inherit] items-center justify-center p-4 text-sm text-[var(--osio-fg-muted)]">
        Graph view is not available in this build.
      </div>
    );
  }
  return (
    <Suspense fallback={fallback}>
      <LazyLegacyGraphEngineExplorer />
    </Suspense>
  );
};
