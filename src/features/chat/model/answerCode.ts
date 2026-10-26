/**
 * What a fenced block of an answer becomes: the code, a diagram, or the code
 * with the reason there is no diagram.
 *
 * The answer is untrusted text. A ```mermaid fence is drawn ONLY through the
 * locked path the diagram block uses (`mermaidSpecToMermaid`: directives,
 * front matter and `click` lines stripped) and only once the answer is
 * complete — a half-written diagram is a parse error, not a picture.
 *
 * Caveat: the decision is made on size and emptiness; whether mermaid can
 * PARSE the source is known only to the renderer, which falls back to showing
 * the source when it cannot.
 */

import { parseDiagramSpec } from "@/features/diagram/model/diagramSpec";
import { mermaidSpecToMermaid } from "@/features/diagram/model/toMermaid";

/** What the block shows. `source` is the LOCKED mermaid, never the raw fence. */
export type CodeBlockView =
  | { kind: "code"; label: string }
  | { kind: "diagram"; label: string; source: string }
  | { kind: "refused"; label: string };

/** The line shown with the code of a diagram the locked renderer refuses. */
export const DIAGRAM_REFUSED_NOTE = "This diagram can't be drawn";

/** The label of a fence: its language, or "text". */
export function codeLabel(lang: string): string {
  return lang.trim() || "text";
}

/** Decides what a fence is drawn as. */
export function codeBlockView(lang: string, code: string, answerComplete: boolean): CodeBlockView {
  const label = codeLabel(lang);
  if (label.toLowerCase() !== "mermaid" || !answerComplete) return { kind: "code", label };
  const parsed = parseDiagramSpec({ kind: "mermaid", source: code });
  if (!parsed.ok || parsed.spec.kind !== "mermaid") return { kind: "refused", label };
  const source = mermaidSpecToMermaid(parsed.spec);
  if (!source.trim()) return { kind: "refused", label };
  return { kind: "diagram", label, source };
}
