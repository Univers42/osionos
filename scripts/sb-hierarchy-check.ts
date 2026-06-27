// Live end-to-end check for the note hierarchy: fetch the real /graph/overview,
// run the REAL mapGraphResponse with the parent-chain notes as the "page store"
// (liveNoteIds), and assert the parent edges survive as `hierarchy` edges with the
// stronger spring — i.e. a child note IS linked to its parent in the graph model.
//   node --experimental-strip-types --experimental-loader ./tests/canvas/ts-extension-loader.mjs scripts/sb-hierarchy-check.ts
import { mapGraphResponse } from "../src/features/second-brain/baas/mapGraphResponse.ts";
import type { BaasGraphResponse } from "../src/features/second-brain/baas/types.ts";

const BAAS = "http://127.0.0.1:8000";
const APIKEY = "mbk_cvbightpaaxq_puvv7u3rvzfolv2cbdh3fj2sqzo6zbty";
const KONG = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3MjMwMTA0LCJleHAiOjE5MzQ5MTAxMDR9.JP6NNY2xkRSt9nG3aqRd22Vh5ly85ZUHoXreJnLJ86g";

const headers = { "Content-Type": "application/json", "X-Baas-Api-Key": APIKEY, apikey: KONG };
// Pull real config from .env so we hit the same shape the app does.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
  const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
}));

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
