// Values the legacy second brain persisted to localStorage, page content, markdown
// exports or external links. The legacy-* rename (T-GR-P1) must never change them:
// a renamed key silently resets user state, a renamed block type orphans saved
// blocks. Each id is pinned to its declaration (file + exact literal), not a bare
// string, so a stray mention elsewhere cannot keep a check green.

import fs from "node:fs";

export const PERSISTED_IDS = [
  { id: "graph_view block type (app)", file: "src/entities/block/model/types.ts", pattern: /^\s*\| 'graph_view'$/m },
  { id: "graph_view block type (engine contract)", file: "packages/markdown-engine/blockContract.ts", pattern: /^\s*\| 'graph_view'$/m },
  { id: "osigraph fence → graph_view (import)", file: "packages/markdown-engine/markdown/shortcuts.ts", pattern: /^\s*osigraph: "graph_view",$/m },
  { id: "graph_view → osigraph fence (export)", file: "src/services/page-actions/pageMarkdownSerialize.ts", pattern: /case "graph_view":\s*\n\s*return appFence\("osigraph", \{\}\);/ },
  { id: 'home variant value "graph"', file: "src/widgets/home-variants/model/homeVariantStore.ts", pattern: /^export type HomeVariant = "dashboard" \| "graph" \| "database" \| "workspace";$/m },
  { id: "localStorage osionos.home.variant", file: "src/widgets/home-variants/model/homeVariantStore.ts", pattern: /^const STORAGE_KEY = "osionos\.home\.variant";$/m },
  { id: "deep link ?home=", file: "src/widgets/home-variants/model/homeVariantStore.ts", pattern: /new URLSearchParams\(globalThis\.location\.search\)\.get\("home"\)/ },
  { id: "localStorage osionos:graph-scope", file: "src/widgets/legacy-graph-explorer/useLegacyGraphModel.ts", pattern: /^const GRAPH_SCOPE_KEY = "osionos:graph-scope";$/m },
  { id: "localStorage osionos-graph-engine (console controls)", file: "src/widgets/legacy-graph-explorer/LegacyGraphEngineExplorer.tsx", pattern: /useControls\("osionos-graph-engine"\)/ },
  { id: "localStorage osio-sb-graph-snapshot", file: "src/features/legacy-second-brain/sync/graphSnapshot.ts", pattern: /^const SNAPSHOT_KEY = "osio-sb-graph-snapshot";$/m },
  { id: "localStorage osio-sb-synced-notes", file: "src/features/legacy-second-brain/sync/noteSyncLedger.ts", pattern: /^const LEDGER_KEY = "osio-sb-synced-notes";$/m },
  { id: 'node-id mount segment "db"', file: "src/features/legacy-second-brain/graphSource.ts", pattern: /^export const LEGACY_GRAPH_SOURCE = "db";$/m },
  { id: 'bridge resource "osionos_pages"', file: "src/features/legacy-second-brain/baas/pageGraphSource.ts", pattern: /^export const LEGACY_PAGE_GRAPH_RESOURCE = "osionos_pages";$/m },
  { id: 'dashboard property option "Second Brain"', file: "src/widgets/page-renderer/ui/MainContent.tsx", pattern: /options: \["Dashboard", "Second Brain"\]/ },
];

/** Returns null when the declaration is intact, else the reason it is not. */
export function persistedIdProblem(repoRoot, entry) {
  const url = new URL(entry.file, repoRoot);
  if (!fs.existsSync(url)) return `${entry.file} is missing`;
  return entry.pattern.test(fs.readFileSync(url, "utf8")) ? null : `${entry.file} no longer declares it as ${entry.pattern}`;
}
