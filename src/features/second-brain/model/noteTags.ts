/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   noteTags.ts                                        :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/03 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Turn a note (page) into graph-ready text + generated topic tags. Notes have no
 * foreign keys, so tags ARE their relation (doc 03): two notes sharing a tag
 * connect through the BaaS tag generator; unshared notes stay orphan. Pure (no
 * DOM/env) so the seed sync (node) and the live publish hook (browser) share it.
 */

export interface TextBlock {
  content?: string;
  children?: TextBlock[];
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "are", "this", "that", "from", "have", "has", "will",
  "can", "all", "our", "out", "use", "get", "set", "new", "how", "what", "when", "who", "why", "into",
  "not", "but", "any", "each", "per", "via", "etc", "page", "notes", "note", "here", "they", "them",
  "its", "was", "were", "been", "more", "most", "some", "than", "then", "also", "add", "see", "one",
]);

/** Flatten a note's blocks into plain text. */
export function blockText(blocks: TextBlock[] | undefined): string {
  if (!blocks) return "";
  return blocks.map((block) => `${block.content ?? ""} ${blockText(block.children)}`).join(" ");
}

/** Generate up to 5 topic tags from title + body (title-weighted, stopword-filtered). */
export function generateTags(title: string, body: string): string[] {
  const counts = new Map<string, number>();
  for (const word of tokenize(title)) counts.set(word, (counts.get(word) ?? 0) + 2);
  for (const word of tokenize(body)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 5);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word) && !/^\d+$/.test(word));
}
