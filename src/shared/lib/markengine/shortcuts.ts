// Markdown shortcuts — inline parsing and block conversion
import type { BlockType, Block } from '@/entities/block';
import type { InlineNode } from "./markdown/ast";
import { parse, parseInline } from "./markdown/parser";
import { getInlineColorOption } from "../inlineTextStyles";

export type { BlockDetection } from "./shortcutsDetect";
export { BLOCK_SHORTCUTS, detectBlockType } from "./shortcutsDetect";

export function parseInlineMarkdown(text: string): string {
  // Use the full parser's inline engine → convert to HTML
  const nodes = parseInline(text);
  return renderInlineNodesToHtml(nodes);
}

function renderInlineNodesToHtml(nodes: InlineNode[]): string {
  const inlineCodeStyle =
    "background:var(--color-surface-tertiary-soft2);border:1px solid var(--color-line);border-radius:6px;padding:0 0.35em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.92em;color:var(--color-ink-strong);";
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
          return escHtml(node.value);
        case "bold":
          return `<strong data-inline-type="bold">${renderInlineNodesToHtml(node.children)}</strong>`;
        case "italic":
          return `<em data-inline-type="italic" style="font-style:italic">${renderInlineNodesToHtml(node.children)}</em>`;
        case "bold_italic":
          return `<strong data-inline-type="bold"><em data-inline-type="italic" style="font-style:italic">${renderInlineNodesToHtml(node.children)}</em></strong>`;
        case "strikethrough":
          return `<del data-inline-type="strikethrough">${renderInlineNodesToHtml(node.children)}</del>`;
        case "underline":
          return `<u>${renderInlineNodesToHtml(node.children)}</u>`;
        case "text_color": {
          const color = getInlineColorOption(node.color)?.textColor;
          if (!color) return renderInlineNodesToHtml(node.children);
          return `<span data-inline-type="text_color" data-inline-color="${escHtml(node.color)}" style="color:${color}">${renderInlineNodesToHtml(node.children)}</span>`;
        }
        case "background_color": {
          const color = getInlineColorOption(node.color)?.backgroundColor;
          if (!color) return renderInlineNodesToHtml(node.children);
          return `<span data-inline-type="background_color" data-inline-color="${escHtml(node.color)}" style="background:${color};border-radius:4px;padding:0 0.2em;">${renderInlineNodesToHtml(node.children)}</span>`;
        }
        case "code":
          return `<code data-inline-type="code" class="inline-code" style="${inlineCodeStyle}">${escHtml(node.value)}</code>`;
        case "link":
          return `<a data-inline-type="link" href="${escHtml(node.href)}">${renderInlineNodesToHtml(node.children)}</a>`;
        case "image":
          return `<img src="${escHtml(node.src)}" alt="${escHtml(node.alt)}" />`;
        case "highlight":
          return `<mark>${renderInlineNodesToHtml(node.children)}</mark>`;
        case "math_inline":
          return `<span class="math-inline">${escHtml(node.value)}</span>`;
        case "emoji":
          return node.value;
        case "line_break":
          return "<br />";
        case "footnote_ref":
          return `<sup>[${escHtml(node.label)}]</sup>`;
        default:
          return "";
      }
    })
    .join("");
}

function escHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Convert a full markdown string into an array of Notion-style blocks.
 * Uses the full AST parser, then maps to Block types.
 */
export function parseMarkdownToBlocks(markdown: string): Block[] {
  const ast = parse(markdown);
  return ast.flatMap((node) => astToBlocks(node));
}

function astToBlocks(node: import("./markdown/ast").BlockNode): Block[] {
  switch (node.type) {
    case "heading": {
      const level = Math.min(node.level, 4);
      const headingType = `heading_${level}` as BlockType;
      return [
        {
          id: crypto.randomUUID(),
          type: headingType,
          content: inlineToPlain(node.children),
        },
      ];
    }
    case "paragraph":
      return [
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          content: inlineToPlain(node.children),
        },
      ];
    case "thematic_break":
      return [{ id: crypto.randomUUID(), type: "divider", content: "" }];
    case "blockquote":
      return [
        {
          id: crypto.randomUUID(),
          type: "quote",
          content: node.children.map((c) => blockToPlain(c)).join("\n"),
        },
      ];
    case "code_block":
      return [
        {
          id: crypto.randomUUID(),
          type: "code",
          content: node.value,
          language: node.lang || "plaintext",
        },
      ];
    case "unordered_list":
      return node.children.map((item) => ({
        id: crypto.randomUUID(),
        type: "bulleted_list" as BlockType,
        content: item.children.map((c) => blockToPlain(c)).join("\n"),
      }));
    case "ordered_list":
      return node.children.map((item) => ({
        id: crypto.randomUUID(),
        type: "numbered_list" as BlockType,
        content: item.children.map((c) => blockToPlain(c)).join("\n"),
      }));
    case "task_list":
      return node.children.map((item) => ({
        id: crypto.randomUUID(),
        type: "to_do" as BlockType,
        content: item.children.map((c) => blockToPlain(c)).join("\n"),
        checked: item.checked,
      }));
    case "callout":
      return [
        {
          id: crypto.randomUUID(),
          type: "callout" as BlockType,
          content: node.children.map((c) => blockToPlain(c)).join("\n"),
        },
      ];
    case "table":
      return [
        {
          id: crypto.randomUUID(),
          type: "table_block" as BlockType,
          content: "",
          tableData: [
            node.head.cells.map((cell) => inlineToPlain(cell.children)),
            ...node.rows.map((row) =>
              row.cells.map((cell) => inlineToPlain(cell.children)),
            ),
          ],
        },
      ];
    default:
      return [];
  }
}

function inlineToPlain(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return n.value;
        case "bold":
        case "italic":
        case "bold_italic":
        case "strikethrough":
        case "underline":
        case "highlight":
        case "text_color":
        case "background_color":
          return inlineToPlain(n.children);
        case "code":
          return n.value;
        case "link":
          return inlineToPlain(n.children);
        case "image":
          return n.alt;
        case "emoji":
          return n.value;
        case "line_break":
          return "\n";
        case "math_inline":
          return n.value;
        case "footnote_ref":
          return `[${n.label}]`;
        default:
          return "";
      }
    })
    .join("");
}

function blockToPlain(node: import("./markdown/ast").BlockNode): string {
  switch (node.type) {
    case "paragraph":
      return inlineToPlain(node.children);
    case "heading":
      return inlineToPlain(node.children);
    default:
      return "";
  }
}
