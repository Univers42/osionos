/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sb-seed-note-tree.ts                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Inject a ~50-note FOREST to demonstrate the recursive note hierarchy: roots →
 * children → grandchildren. Each note is one node; a child carries a `parent`
 * edge to its parent (type "parent") — the tree shows up in the graph. Notes are
 * orphan-by-default; only the hierarchy connects them, plus a few that share an
 * explicit tag (to show tag-relations crossing the tree). Notes → Mongo og_notes
 * (plain /query); parent edges → PG og_edges (the edges mount). Idempotent upsert.
 *
 *   SB_BAAS_URL SB_API_KEY SB_KONG_KEY SB_MONGO_DB SB_EDGES_DB \
 *     node --experimental-strip-types \
 *       --experimental-loader ./tests/canvas/ts-extension-loader.mjs \
 *       scripts/sb-seed-note-tree.ts [--clean]
 */

const BASE = need("SB_BAAS_URL");
const API_KEY = need("SB_API_KEY");
const KONG = process.env.SB_KONG_KEY ?? "";
const MONGO = need("SB_MONGO_DB");
const PG = need("SB_EDGES_DB");
const NOTES = "og_notes";
const EDGES = "og_edges";
const CLEAN = process.argv.includes("--clean");

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

interface DemoNote { pk: string; title: string; parent: string | null; tags: string[] }

/** Build a forest: roots → children → grandchildren (recursive). */
function buildForest(): DemoNote[] {
  const notes: DemoNote[] = [];
  let counter = 0;
  const add = (title: string, parent: string | null, tags: string[] = []): string => {
    const pk = `osio-note-demo-${counter++}`;
    notes.push({ pk, title, parent, tags });
    return pk;
  };
  const tree: Record<string, Record<string, string[]>> = {
    "Engineering Wiki": { "Architecture Overview": ["Data Plane", "Gateway", "Auth Flow"], "Coding Standards": ["Naming", "Testing"], "Onboarding Guide": [], "Incident Log": [] },
    "Design System": { "Color Tokens": ["Light", "Dark"], "Typography": [], "Components": ["Button", "Modal", "Graph Canvas"], "Accessibility": [] },
    "Product Strategy": { "Q3 Roadmap": ["Second Brain", "Mobile", "Search"], "Personas": ["Admin", "Power User"], "Competitive Analysis": [], "Pricing": [] },
    "Research": { "User Interviews": ["Interview 1", "Interview 2"], "Market Notes": [], "Reading List": [], "Experiments": ["Tag Clustering", "Force Layout"] },
    "Operations": { "Runbooks": ["Deploy"], "Vendors": [], "Budgets": [] },
    "Personal Journal": { "Ideas": ["Graph Tags", "Note Hierarchy"], "Daily Notes": [], "Goals": [] },
  };
  // A few notes share the "ideas" tag → tag-relations that cross the hierarchy.
  const tagged = new Set(["Ideas", "Reading List", "Graph Tags", "Note Hierarchy", "Tag Clustering", "Experiments"]);
  const tagsFor = (title: string) => (tagged.has(title) ? ["ideas"] : []);
  for (const [root, children] of Object.entries(tree)) {
    const rootPk = add(root, null, tagsFor(root));
    for (const [child, grandchildren] of Object.entries(children)) {
      const childPk = add(child, rootPk, tagsFor(child));
      for (const grand of grandchildren) add(grand, childPk, tagsFor(grand));
    }
  }
  return notes;
}

async function post(path: string, body: unknown): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Baas-Api-Key": API_KEY };
  if (KONG) headers.apikey = KONG;
  const response = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}: ${await response.text().catch(() => "")}`);
}

const forest = buildForest();
console.log(`${CLEAN ? "Removing" : "Injecting"} ${forest.length}-note forest (roots→children→grandchildren)`);

for (const note of forest) {
  const edgeId = `osio-noteparent-${note.pk}`;
  if (CLEAN) {
    await post(`/query/v1/${MONGO}/tables/${NOTES}`, { op: "delete", filter: { id: note.pk } });
    if (note.parent) await post(`/query/v1/${PG}/tables/${EDGES}`, { op: "delete", filter: { id: edgeId } });
    continue;
  }
  await post(`/query/v1/${MONGO}/tables/${NOTES}`, {
    op: "upsert",
    filter: { id: note.pk },
    data: { id: note.pk, title: note.title, body: `Demo note: ${note.title}`, tags: note.tags },
  });
  if (note.parent) {
    await post(`/query/v1/${PG}/tables/${EDGES}`, {
      op: "upsert",
      filter: { id: edgeId },
      data: { id: edgeId, from: `${MONGO}:${NOTES}:${note.pk}`, to: `${MONGO}:${NOTES}:${note.parent}`, type: "parent" },
    });
  }
}

const roots = forest.filter((n) => !n.parent).length;
console.log(CLEAN ? "CLEAN COMPLETE." : `DONE — ${forest.length} notes (${roots} roots), ${forest.length - roots} parent edges. Open the graph to see the tree.`);
