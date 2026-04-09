export type BlockKind =
  | "document"
  | "paragraph"
  | "heading"
  | "code_block"
  | "list"
  | "list_item"
  | "blockquote"
  | "thematic_break";

export type InlineKind = "text" | "emphasis" | "strong" | "code_span" | "link";

export interface SourceSpan {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface BaseNode {
  id: string;
  kind: BlockKind | InlineKind;
  span: SourceSpan;
}

export interface TextNode extends BaseNode {
  kind: "text";
  value: string;
}

export interface EmphasisNode extends BaseNode {
  kind: "emphasis";
  children: InlineNode[];
}

export interface StrongNode extends BaseNode {
  kind: "strong";
  children: InlineNode[];
}

export interface CodeSpanNode extends BaseNode {
  kind: "code_span";
  value: string;
}

export interface LinkNode extends BaseNode {
  kind: "link";
  href: string;
  children: InlineNode[];
}

export type InlineNode =
  | TextNode
  | EmphasisNode
  | StrongNode
  | CodeSpanNode
  | LinkNode;

export interface ParagraphNode extends BaseNode {
  kind: "paragraph";
  children: InlineNode[];
}

export interface HeadingNode extends BaseNode {
  kind: "heading";
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  children: InlineNode[];
}

export interface CodeBlockNode extends BaseNode {
  kind: "code_block";
  language: string | null;
  value: string;
}

export interface ListNode extends BaseNode {
  kind: "list";
  ordered: boolean;
  start: number;
  items: ListItemNode[];
}

export interface ListItemNode extends BaseNode {
  kind: "list_item";
  checked?: boolean;
  children: BlockNode[];
}

export interface BlockquoteNode extends BaseNode {
  kind: "blockquote";
  children: BlockNode[];
}

export interface ThematicBreakNode extends BaseNode {
  kind: "thematic_break";
}

export interface DocumentNode extends BaseNode {
  kind: "document";
  children: BlockNode[];
  version: number;
}

export type BlockNode =
  | ParagraphNode
  | HeadingNode
  | CodeBlockNode
  | ListNode
  | ListItemNode
  | BlockquoteNode
  | ThematicBreakNode;

export interface ParseOptions {
  documentVersion?: number;
}

export interface ParseResult {
  ast: DocumentNode;
  blockIndex: BlockRange[];
}

export interface BlockRange {
  id: string;
  startLine: number;
  endLine: number;
}

export interface IncrementalPatch {
  fromLine: number;
  toLine: number;
  text: string;
}

export interface IncrementalParseResult {
  text: string;
  ast: DocumentNode;
  changedNodeIds: string[];
}
