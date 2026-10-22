/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   toMermaid.ts                                        +:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The emitter: an IR in, mermaid text out. This is the TRUST BOUNDARY
 * (devil C109).
 *
 * Every label of a diagram comes from a shared page, a database or the AI —
 * from people the reader does not trust. A label that reaches mermaid raw can
 * close its own bracket, open a new statement, start a `%%{init:…}%%`
 * directive or bind a `click` callback. So every label goes through ONE
 * function, `escapeLabel`, and nothing else touches a label.
 *
 * Two more rules hold the line:
 *
 *  - the node ids are GENERATED (`n0`, `n1`, …). A data id is a uuid today,
 *    but it is a STRING from the database, and a string that reaches a
 *    mermaid statement is a statement. The emitter never writes one.
 *  - every kind of diagram is a `flowchart`, so there is ONE parser, ONE
 *    escaping path and ONE renderer to lock.
 */

import { sanitizeMermaidSource } from "@osionos/ui/molecules/MermaidDiagram/lockedMermaid";

import type { DiagramIR } from "./diagramIR";
import type { DiagramSpec } from "./diagramSpec";

/** The longest label the emitter writes, in characters. */
const MAX_LABEL = 80;

/**
 * What an empty label is drawn as. Mermaid's lexer has no empty string — a
 * `n0[""]` is a PARSE ERROR, not an empty box — so a page without a title
 * needs a name. It is the name the app gives an untitled page everywhere else.
 */
const EMPTY_LABEL = "Untitled";

/**
 * The characters a label may not carry raw. Each one becomes its FULLWIDTH
 * form (U+FF01–U+FF5E, the ASCII code point + 0xFEE0): the same glyph to a
 * reader, and no syntax to mermaid.
 *
 * Not mermaid's entity codes (`#34;`): with `htmlLabels: false` — the locked
 * renderer's setting — they are drawn LITERALLY ("Q3 &#40;draft&#41;"), measured
 * in the browser on the offline build. `(`, `)`, `&` and `#` stay raw: inside a
 * quoted label they are text, and with `;` escaped neither `#35;` nor `&amp;` can
 * form an entity (both need an ASCII `;`).
 *
 * Caveat: the fullwidth glyphs come from a CJK-capable fallback font. Windows,
 * macOS, iOS, Android, ChromeOS and the common Linux desktops ship one; a device
 * with none draws these characters as empty boxes (seen in a headless Chrome
 * container with 17 fonts, none covering U+FF00). The label stays safe either way.
 */
const ESCAPED = /["%;<>[\]`{|}]/g;

/** The fullwidth form of one ASCII character. */
function fullwidth(char: string): string {
  return String.fromCodePoint((char.codePointAt(0) ?? 0) + 0xfee0);
}

/**
 * The characters that may not reach a label: the C0 and C1 controls, the
 * zero-widths, the line separators and the bidi controls (a right-to-left
 * override makes a file name read as another one).
 */
// eslint-disable-next-line no-control-regex -- stripping the control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

/** How the emitter draws a diagram. */
export interface MermaidOptions {
  /** Left-to-right (the default) or top-to-bottom. */
  direction?: "LR" | "TB";
  /**
   * The title of the diagram. It is DELIBERATELY NOT EMITTED: a mermaid
   * front-matter block is config, and the locked renderer strips it — so the
   * title would vanish. The block shows it as text instead.
   */
  title?: string;
}

/**
 * The ONE way a label becomes text: strip the controls, collapse the spaces,
 * cut at 80 characters, and encode every character that could end the label or
 * open a statement.
 */
export function escapeLabel(text: string): string {
  const cleaned = text.replace(CONTROL_CHARACTERS, " ").replace(/\s+/g, " ").trim();
  const cut = cleaned.length > MAX_LABEL ? `${cleaned.slice(0, MAX_LABEL - 1)}…` : cleaned;
  return cut.replace(ESCAPED, fullwidth);
}

/**
 * The IR as mermaid text: one `flowchart`, one node per node, one edge per
 * edge, one `subgraph` per group.
 *
 * The node ids are generated here (`n0`, `n1`, …): the ids of the data never
 * reach the text. Every label goes through `escapeLabel`, the node labels, the
 * group labels and the edge labels alike.
 */
export function irToMermaid(ir: DiagramIR, options: MermaidOptions = {}): string {
  const direction = options.direction ?? "LR";
  const generated = ir.nodes.map((_, index) => `n${index}`);
  const byId = new Map<string, string>();
  ir.nodes.forEach((node, index) => {
    if (!byId.has(node.id)) byId.set(node.id, generated[index]);
  });
  const groupIds = new Set(ir.groups.map((group) => group.id));
  const lines: string[] = [`flowchart ${direction}`];
  ir.groups.forEach((group, index) => {
    lines.push(`subgraph g${index}["${escapeLabel(group.label) || EMPTY_LABEL}"]`);
    ir.nodes.forEach((node, nodeIndex) => {
      if (node.group === group.id) {
        lines.push(`${generated[nodeIndex]}["${escapeLabel(node.label) || EMPTY_LABEL}"]`);
      }
    });
    lines.push("end");
  });
  ir.nodes.forEach((node, index) => {
    if (!node.group || !groupIds.has(node.group)) {
      lines.push(`${generated[index]}["${escapeLabel(node.label) || EMPTY_LABEL}"]`);
    }
  });
  for (const edge of ir.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    // An edge with no label is an arrow, not an arrow with an empty label.
    const label = edge.label ? escapeLabel(edge.label) : "";
    const middle = label ? ` -- "${label}" --> ` : " --> ";
    lines.push(`${from}${middle}${to}`);
  }
  return lines.join("\n");
}

/**
 * The hand-written mermaid of a spec. It goes through the LOCKED path, like
 * every other diagram: the compiler never trusts a source it did not write.
 */
export function mermaidSpecToMermaid(
  spec: Extract<DiagramSpec, { kind: "mermaid" }>,
): string {
  return sanitizeMermaidSource(spec.source);
}
