// Every import of legacy second-brain code from outside the legacy folders. The
// gate is only sound if each of these goes through it, so the allowed set is
// explicit: a new importer must be added here, with its reason, to pass.

import fs from "node:fs";
import path from "node:path";

const LEGACY_DIRS = ["src/features/legacy-second-brain/", "src/widgets/legacy-graph-explorer/"];
// Ponytail: a regex over static specifiers. It catches import/export-from and
// import("...") with any path naming a legacy dir (alias or relative); it misses a
// require() or a specifier built at runtime. Neither style is used in src/ today.
const LEGACY_IMPORT = /(?:from|import\()\s*["']([^"']*(?:legacy-second-brain|legacy-graph-explorer|legacy-graph-engine)[^"']*)["']/g;

export const ALLOWED_IMPORTS = {
  "src/widgets/page-renderer/ui/HomeTabView.tsx": ["@/widgets/legacy-graph-explorer/lazy"], // gated: null when off
  // gated: the graph_view block body for both the editor and the read-only renderer
  "src/widgets/graph-studio-view/GraphViewBlock.tsx": ["@/widgets/legacy-graph-explorer/LegacyGraphViewBlock"],
  // Old Home "Database" browser (not second brain): reuses the baas client, has no
  // importer since 80f58f2, so it is not reachable either.
  "src/widgets/home-variants/model/baasDatabaseData.ts": [
    "@/features/legacy-second-brain/baas/baasFetch",
    "@/features/legacy-second-brain/baas/baasGraphClient",
    "@/features/legacy-second-brain/baas/types",
  ],
  "src/widgets/home-variants/ui/HomeDatabaseMode.tsx": ["@/features/legacy-second-brain/baas/baasFetch"],
  "src/widgets/home-variants/ui/DatabaseBrowserParts.tsx": ["@/features/legacy-second-brain/baas/types"],
};

function* sourceFiles(dir, root) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full, root);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield path.relative(root, full).split(path.sep).join("/");
  }
}

/** { file: [legacy specifiers] } for every non-legacy file under src/ importing legacy code. */
export function legacyImportersOutside(repoRoot) {
  const root = repoRoot instanceof URL ? repoRoot.pathname : repoRoot;
  const found = {};
  for (const file of sourceFiles(path.join(root, "src"), root)) {
    if (LEGACY_DIRS.some((dir) => file.startsWith(dir))) continue;
    const specifiers = [...fs.readFileSync(path.join(root, file), "utf8").matchAll(LEGACY_IMPORT)].map((m) => m[1]);
    if (specifiers.length) found[file] = [...new Set(specifiers)].sort();
  }
  return found;
}
