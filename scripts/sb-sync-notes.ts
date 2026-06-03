/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   sb-sync-notes.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Sync osionos's real NOTES (the seed pages) into the graph as a distinct,
 * note-colored layer. Notes didn't exist in the source databases, so they have
 * no foreign keys — the meaningful relationship is by TAGS we *generate* from
 * each note's title + content (keyword extraction). Notes sharing a tag connect
 * through the BaaS tag generator (and can even link to data nodes that share a
 * tag). Notes with no shared tag stay orphan — exactly as intended.
 *
 * Stored in the Mongo `og_notes` collection (auto-creates; non-transactional →
 * plain /query inserts). Add {dbId:<mongo>,table:og_notes} to the graph
 * resources + VITE_BAAS_NOTES_TABLE=og_notes so they render in the note color.
 *
 *   SB_BAAS_URL SB_API_KEY SB_KONG_KEY SB_MONGO_DB \
 *     node --experimental-strip-types \
 *       --experimental-loader ./tests/canvas/ts-extension-loader.mjs \
 *       scripts/sb-sync-notes.ts [--clean]
 */

import { gettingStarted, projectRoadmap, meetingNotes } from "../src/data/seedAdminPages.ts";
import { designSystem, sprintReview, quickNotes, readingList } from "../src/data/seedUserPages.ts";
import { blockText } from "../src/features/second-brain/model/noteTags.ts";

const BASE = need("SB_BAAS_URL");
const API_KEY = need("SB_API_KEY");
const KONG = process.env.SB_KONG_KEY ?? "";
const MONGO = need("SB_MONGO_DB");
const NOTES_TABLE = "og_notes";
const CLEAN = process.argv.includes("--clean");

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

interface Block { content?: string; children?: Block[] }
interface SeedNote { _id: string; title: string; content?: Block[] }

async function queryOp(op: "insert" | "delete", payload: Record<string, unknown>): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Baas-Api-Key": API_KEY };
  if (KONG) headers.apikey = KONG;
  const body = op === "insert" ? { op, data: payload } : { op, filter: payload };
  const response = await fetch(`${BASE}/query/v1/${MONGO}/tables/${NOTES_TABLE}`, { method: "POST", headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${op} ${NOTES_TABLE} HTTP ${response.status}: ${await response.text().catch(() => "")}`);
}

const notes: SeedNote[] = [gettingStarted, projectRoadmap, meetingNotes, designSystem, sprintReview, quickNotes, readingList];

console.log(`${CLEAN ? "Removing" : "Syncing"} ${notes.length} osionos notes → Mongo ${NOTES_TABLE}`);
for (const note of notes) {
  const id = `osio-note-${note._id}`;
  if (CLEAN) {
    await queryOp("delete", { id });
    console.log(`  − ${note.title}`);
  } else {
    const body = blockText(note.content).replace(/\s+/g, " ").trim().slice(0, 600);
    // Orphan-by-default: no auto-tags (those caused title→tag-hub duplicates and
    // an over-connected hairball). Notes connect by hierarchy + explicit tags only.
    await queryOp("insert", { id, title: note.title, body, tags: [] });
    console.log(`  + ${note.title}`);
  }
}
console.log(CLEAN ? "CLEAN COMPLETE." : "SYNC COMPLETE — notes are note-colored and connect by shared tags.");
