// Markdown parser — inline formatting types
import type { InlineNode } from './ast';

export interface InlineMatchResult {
  start: number;
  end: number;
  node: InlineNode;
}

export type InlineMatcher = (text: string, pos: number) => InlineMatchResult | null;

export type InlineParser = (text: string) => InlineNode[];
