/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ast.ts                                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/01 16:40:43 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/02 01:19:23 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// ═══════════════════════════════════════════════════════════════════════════════
// Markdown AST — pure data types, zero dependencies
// ═══════════════════════════════════════════════════════════════════════════════
//
// Every renderer (HTML, React, Terminal) consumes this same AST.
// The parser produces it; renderers walk it. No coupling between phases.
//
// Design principles:
//   1. Framework-agnostic — no React, no DOM, no ANSI
//   2. Serializable to JSON (useful for caching / WASM boundary)
//   3. Maps 1-to-1 to CommonMark + GFM extensions
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Inline nodes (leaf-level text/formatting) ────────────────────────────────

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'bold_italic'; children: InlineNode[] }
  | { type: 'strikethrough'; children: InlineNode[] }
  | { type: 'underline'; children: InlineNode[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; title?: string; children: InlineNode[] }
  | { type: 'image'; src: string; alt: string; title?: string }
  | { type: 'line_break' }
  | { type: 'highlight'; children: InlineNode[] }
  | { type: 'math_inline'; value: string }
  | { type: 'footnote_ref'; label: string }
  | { type: 'emoji'; value: string; raw: string };

// ─── Block nodes (structural containers) ──────────────────────────────────────

export type BlockNode =
  | { type: 'document'; children: BlockNode[] }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: InlineNode[]; id?: string }
  | { type: 'blockquote'; children: BlockNode[] }
  | { type: 'code_block'; lang: string; meta?: string; value: string }
  | { type: 'ordered_list'; start: number; children: ListItemNode[] }
  | { type: 'unordered_list'; children: ListItemNode[] }
  | { type: 'task_list'; children: TaskItemNode[] }
  | { type: 'list_item'; children: BlockNode[] }
  | { type: 'thematic_break' }
  | { type: 'table'; head: TableRowNode; rows: TableRowNode[]; alignments: TableAlign[] }
  | { type: 'callout'; kind: string; title: InlineNode[]; children: BlockNode[] }
  | { type: 'math_block'; value: string }
  | { type: 'html_block'; value: string }
  | { type: 'footnote_def'; label: string; children: BlockNode[] }
  | { type: 'definition_list'; items: DefinitionItem[] }
  | { type: 'toggle'; summary: InlineNode[]; children: BlockNode[] };

export interface ListItemNode {
  type: 'list_item';
  children: BlockNode[];
}

export interface TaskItemNode {
  type: 'task_item';
  checked: boolean;
  children: BlockNode[];
}

export interface TableRowNode {
  type: 'table_row';
  cells: TableCellNode[];
}

export interface TableCellNode {
  type: 'table_cell';
  children: InlineNode[];
}

export type TableAlign = 'left' | 'center' | 'right' | null;

export interface DefinitionItem {
  term: InlineNode[];
  definitions: InlineNode[][];
}

// ─── Convenience type guard helpers ───────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isInlineNode(node: any): node is InlineNode {
  return node && typeof node.type === 'string' && [
    'text', 'bold', 'italic', 'bold_italic', 'strikethrough', 'underline',
    'code', 'link', 'image', 'line_break', 'highlight', 'math_inline',
    'footnote_ref', 'emoji',
  ].includes(node.type);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isBlockNode(node: any): node is BlockNode {
  return node && typeof node.type === 'string' && [
    'document', 'paragraph', 'heading', 'blockquote', 'code_block',
    'ordered_list', 'unordered_list', 'task_list', 'list_item',
    'thematic_break', 'table', 'callout', 'math_block', 'html_block',
    'footnote_def', 'definition_list', 'toggle',
  ].includes(node.type);
}
