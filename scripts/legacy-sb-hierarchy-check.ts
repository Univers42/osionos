// Live end-to-end check for the note hierarchy: fetch the real /graph/overview,
// run the REAL mapGraphResponse with the parent-chain notes as the "page store"
// (liveNoteIds), and assert the parent edges survive as `hierarchy` edges with the
// stronger spring — i.e. a child note IS linked to its parent in the graph model.
//   node --experimental-strip-types --experimental-loader ./tests/canvas/ts-extension-loader.mjs scripts/legacy-sb-hierarchy-check.ts
import { mapGraphResponse } from "../src/features/legacy-second-brain/baas/mapGraphResponse.ts";
import { readDotEnv, requiredEnv } from "./required-env.mjs";
import type { BaasGraphResponse } from "../src/features/legacy-second-brain/baas/types.ts";

const BAAS = "http://127.0.0.1:8000";
// Same keys the app is built with: the tenant key and Kong key from this checkout's .env.
const env = readDotEnv(".env");
const BAAS_HINT = "set it in apps/osionos/app/.env (make seed-live-demo mints the tenant key)";
const APIKEY = requiredEnv("VITE_BAAS_API_KEY", BAAS_HINT, env);
const KONG = requiredEnv("VITE_BAAS_KONG_KEY", BAAS_HINT, env);

const headers = { "Content-Type": "application/json", "X-Baas-Api-Key": APIKEY, apikey: KONG };

const payload = {
  resources: JSON.parse(env.VITE_BAAS_GRAPH_RESOURCES),
  edgesDbId: env.VITE_BAAS_EDGES_DB_ID,
  edgesTable: env.VITE_BAAS_EDGES_TABLE,
  limit: 400,
  generators: JSON.parse(env.VITE_BAAS_GRAPH_GENERATORS),
};

const res = await fetch(`${BAAS}/query/v1/graph/overview`, { method: "POST", headers, body: JSON.stringify(payload) });
const overview = (await res.json()) as BaasGraphResponse;
console.log(`overview: ${overview.nodes.length} nodes, ${overview.edges.length} edges`);

// The known parent chain (a note child inside a note child).
const chain = [
  "osio-note-local-page-2-mpxd71oe",
  "osio-note-local-page-1-mpx9g4kk",
  "osio-note-local-page-1-mpx941p3",
];
// liveNoteIds = simulate the owning user's page store containing the chain.
const liveNoteIds = new Set(chain);
const noteResources = new Set([env.VITE_BAAS_NOTES_TABLE]);

const { model } = mapGraphResponse(overview, { noteResources, liveNoteIds });
const hierarchy = model.edges.filter((e) => e.kind === "hierarchy");
console.log(`\nhierarchy edges in the mapped model: ${hierarchy.length}`);
for (const e of hierarchy) {
  const from = model.nodeById.get(e.source);
  const to = model.nodeById.get(e.target);
  console.log(`  ${from?.label ?? e.source.split(":").pop()} ──parent──▶ ${to?.label ?? e.target.split(":").pop()}  (strength ${e.strength}, both nodes present: ${!!from && !!to})`);
}
const ok = hierarchy.length >= 2 && hierarchy.every((e) => e.strength > 1.4 && model.nodeById.has(e.source) && model.nodeById.has(e.target));
console.log(`\nRESULT: child notes ARE linked to their parents in the graph = ${ok ? "YES ✅" : "NO ❌"}`);
