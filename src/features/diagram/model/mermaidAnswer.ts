/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   mermaidAnswer.ts                                    +:      :+:    :+:   */
/*                                                    copyrightc        */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  licensed        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The mermaid of an AI answer.
 *
 * The `/diagram` command asks the model for ONE fenced mermaid block, and the
 * editor turns that block into a diagram block: a SPEC (`{ kind: "mermaid",
 * source }`), never a picture.
 *
 * The answer is untrusted text (a model may be led by a prompt injection), so
 * the source is only EXTRACTED here: it goes through the locked renderer
 * (`mermaidSpecToMermaid`) before anything draws it, and the spec's own cap
 * holds the length.
 *
 * This file is PURE: it reads no store, no network and no clock.
 */

import { MAX_MERMAID_SOURCE } from "./diagramSpec";

/** A fenced mermaid block: the fence, the language, the source. */
const FENCE = /(?:`{3,}|~{3,})[ \t]*mermaid[ \t]*\r?\n([\s\S]*?)(?:`{3,}|~{3,})/i;

/** The diagrams mermaid draws: the first word of a source that IS one. */
const DIAGRAM_WORDS = [
  "flowchart",
  "graph",
  "sequencediagram",
  "classdiagram",
  "statediagram",
  "erdiagram",
  "journey",
  "gantt",
  "mindmap",
  "timeline",
  "quadrantchart",
  "pie",
  "gitgraph",
  "requirementdiagram",
  "c4context",
];

/**
 * The mermaid source of an AI answer, or null when the answer holds none.
 *
 * A fenced block wins: it is what the command asked for. An answer that IS a
 * diagram without a fence is taken whole — the locked renderer decides
 * whether it parses.
 *
 * A source over the spec's cap is REFUSED: a spec that does not parse is a
 * broken block, and a diagram that does not draw is worse than the text the
 * model wrote.
 */
export function mermaidFromAnswer(answer: string): string | null {
  const fenced = FENCE.exec(answer);
  const candidate = fenced ? fenced[1] : answer;
  const source = candidate.trim();
  if (!source) return null;
  if (source.length > MAX_MERMAID_SOURCE) return null;
  if (!fenced) {
    const first = source.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
    if (!DIAGRAM_WORDS.includes(first)) return null;
    // An unfenced candidate must be a SINGLE diagram: no trailing prose. A
    // blank line followed by more content, or a non-indented line that is not
    // a diagram construct, means prose followed the diagram.
    const lines = source.split("\n");
    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      const trimmed = line.trim();
      if (trimmed === "") {
        if (lines.slice(index + 1).some((candidate) => candidate.trim() !== "")) {
          return null;
        }
        continue;
      }
      const lower = trimmed.toLowerCase();
      if (DIAGRAM_WORDS.some((word) => lower.startsWith(word))) continue;
      if (/^(subgraph|end|classdef|class|style|click|linkstyle|direction|title|acctitle|accdescr|participant|actor|box|autonumber|note|activate|deactivate|loop|alt|else|opt|par|and|rect|section)\b/i.test(trimmed)) continue;
      // A mermaid statement carries special characters; a sentence is plain
      // words. An indented line is part of a statement; an unindented line
      // with no mermaid special chars and a sentence shape is prose.
      const isProse = !/^\s/.test(line)
        && !/[<>{}()[\]|&;]/.test(trimmed)
        && !/-->|---|\.\.\.|==>|-.->|==/.test(trimmed)
        && (/\.$/.test(trimmed) || trimmed.split(/\s+/).length >= 2);
      if (isProse) return null;
    }
  }
  return source;
}
