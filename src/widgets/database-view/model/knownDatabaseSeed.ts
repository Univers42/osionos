import type { NotionState } from "@notion-db/object-database";

import seedState from "@/shared/notion-database-sys/src/store/dbms/mongodb/_notion_state.json";
import { applyWikiSeed } from "./wikiSeed";
import { applyHomeDemoSeed } from "./homeDemoSeed";
import { applyGradesSeed } from "./gradesSeed";
import { cloneState } from "./knownDatabaseClone";

export function seedSnapshot(): NotionState {
  // The Delivery Wiki slice (Milestones ↔ Files), the Home demo slice
  // (Events + Learn), and the Grades slice (grade-calculator template) extend
  // the JSON seed at the same precedence level — stored user state overlays all.
  return applyGradesSeed(applyHomeDemoSeed(applyWikiSeed(cloneState(seedState as NotionState))));
}

let seedIdsCache: { databases: ReadonlySet<string>; pages: ReadonlySet<string> } | null = null;

/** The ids of every code-shipped seed database (the JSON seed + the wiki/home/
 *  grades appliers) and of every page it ships. Anything NOT in the database
 *  set is a user-created database that syncs to the server; the seeds
 *  regenerate from code, so they stay local. Cached: the seed snapshot is a
 *  heavy structuredClone. */
function seedIds(): { databases: ReadonlySet<string>; pages: ReadonlySet<string> } {
  if (!seedIdsCache) {
    const seed = seedSnapshot();
    seedIdsCache = {
      databases: new Set(Object.keys(seed.databases)),
      pages: new Set(Object.keys(seed.pages)),
    };
  }
  return seedIdsCache;
}

export function seedDatabaseIds(): ReadonlySet<string> {
  return seedIds().databases;
}

/** The pages the code seed still ships. The seed merge fills every page the
 *  snapshot lacks, so a deleted seed row would come back unless it stays
 *  tombstoned — and the server never holds seed pages, so it can never
 *  confirm their death. */
export function seedPageIds(): ReadonlySet<string> {
  return seedIds().pages;
}
