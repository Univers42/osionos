/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeContentMerge.ts                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The Home dashboard's three-way merge (P2-4-b).
 *
 * The seed says what a block SHOULD look like, the fingerprints say what it
 * looked like when it was seeded, and the page says what the user did to it
 * since. Only the seed may change a block the user never touched: an edited
 * block keeps the user's wording, a deleted block stays deleted, a block the
 * user added stays where they put it.
 *
 * Caveat: the fingerprint covers the whole block JSON. If the editor
 * normalises a block on load (adds a default key), an untouched seed block
 * reads as edited. That failure is the safe direction: the block keeps its old
 * seed content and nothing is lost. The fix would be to fingerprint a
 * normalised projection.
 *
 * Caveat: a page cached before the fingerprints existed cannot be told from a
 * page whose user deleted a seed block, so the first merge on it treats every
 * seed block it still holds as unchanged — a seed block edited before this
 * change loses that edit once, and a seed block deleted before this change
 * comes back once. Today both are lost on every reload.
 */

import type { Block } from "@/entities/block";

export interface HomeContentMergeResult {
  /** The page's content after the merge. */
  content: Block[];
  /** What each seeded block looked like when it was seeded. */
  fingerprints: Record<string, string>;
}

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a (32 bit) over the block's JSON, in hex. */
export function fingerprintHomeBlock(block: Block): string {
  const bytes = new TextEncoder().encode(JSON.stringify(block));
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Merge the page's current content with a fresh seed.
 *
 * @param current the blocks the page holds now
 * @param nextSeed the blocks the seed wants
 * @param fingerprints what each seeded block looked like when it was seeded;
 *   absent on a page cached before the fingerprints existed
 */
export function mergeHomeContent(
  current: Block[],
  nextSeed: Block[],
  fingerprints?: Record<string, string>,
): HomeContentMergeResult {
  const legacy = fingerprints === undefined;
  const seeded = new Map(Object.entries(fingerprints ?? {}));
  const seedById = new Map(nextSeed.map((block) => [block.id, block]));
  // The seed's fingerprints survive the merge: a deleted block keeps its entry
  // (so it stays deleted) and an edited block keeps its old one (so it stays
  // "edited").
  const nextFingerprints = new Map(seeded);
  const content: Block[] = [];

  for (const block of current) {
    const wasSeeded = legacy ? seedById.has(block.id) : seeded.has(block.id);
    if (!wasSeeded) {
      content.push(block);
      continue;
    }
    const edited = !legacy && seeded.get(block.id) !== fingerprintHomeBlock(block);
    if (edited) {
      content.push(block);
      continue;
    }
    const replacement = seedById.get(block.id);
    if (!replacement) continue;
    content.push(replacement);
    nextFingerprints.set(block.id, fingerprintHomeBlock(replacement));
  }

  const resultIds = new Set(content.map((block) => block.id));
  nextSeed.forEach((seedBlock, index) => {
    // A block the seed already seeded is the user's decision now: kept as
    // edited, kept as deleted. Only a block the seed never seeded is new.
    if (seeded.has(seedBlock.id) || resultIds.has(seedBlock.id)) return;
    let insertAt = 0;
    for (let back = index - 1; back >= 0; back -= 1) {
      const position = content.findIndex((block) => block.id === nextSeed[back].id);
      if (position >= 0) {
        insertAt = position + 1;
        break;
      }
    }
    content.splice(insertAt, 0, seedBlock);
    resultIds.add(seedBlock.id);
    nextFingerprints.set(seedBlock.id, fingerprintHomeBlock(seedBlock));
  });

  return { content, fingerprints: Object.fromEntries(nextFingerprints) };
}
