/* ************************************************************************** */
/*                                                                            */
/*   sentimentRows.ts                                                         */
/*                                                                            */
/*   The per-row labels of an AI-filled select (M6): a closed map of          */
/*   rowId → negative|neutral|positive. The service is the authority; this    */
/*   module only refuses shapes the contract does not allow.                  */
/*                                                                            */
/* ************************************************************************** */

import type { SentimentLabel } from "./sentimentPulse";

const LABELS: readonly SentimentLabel[] = ["negative", "neutral", "positive"];

const isLabel = (value: unknown): value is SentimentLabel =>
  LABELS.includes(value as SentimentLabel);

/**
 * `{ [rowId]: label }` from the route, or null when the answer is not an
 * object. An unknown label is dropped (it is never rendered), arrays and
 * non-objects are rejected whole, and `{}` is kept: no row has a score yet.
 */
export function parseRowSentiments(value: unknown): Record<string, SentimentLabel> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rows: Record<string, SentimentLabel> = {};
  for (const [rowId, label] of Object.entries(value)) {
    if (isLabel(label)) rows[rowId] = label;
  }
  return rows;
}
