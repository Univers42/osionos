// Markdown shortcuts — inline parsing and block conversion
import type { BlockType, Block } from "@/entities/block";
import type { BlockNode, InlineNode } from "./ast";
import {
  renderInlineNodesToHtml,
  type InlineHtmlOptions,
} from "./renderers/inlineHtml";
import { parse, parseInline } from "./parser";

export type { BlockDetection } from "./shortcutsDetect";
export { BLOCK_SHORTCUTS, detectBlockType } from "./shortcutsDetect";

export function parseInlineMarkdown(
  text: string,
  options: InlineHtmlOptions = {},
): string {
  // Use the full parser's inline engine → convert to HTML
  const nodes = parseInline(text);
  return renderInlineNodesToHtml(nodes, options);
}

/**
 * Convert a full markdown string into an array of Notion-style blocks.
 * Uses the full AST parser, then maps to Block types.
 */
export function parseMarkdownToBlocks(markdown: string): Block[] {
  const ast = parse(markdown);
  return ast.flatMap((node) => astToBlocks(node));
}

function astToBlocks(node: BlockNode): Block[] {
  switch (node.type) {
    case "document":
      return node.children.flatMap((child) => astToBlocks(child));
    case "heading": {
      const level = node.level;
      const headingType = `heading_${level}` as BlockType;
      return [
        {
          id: crypto.randomUUID(),
          type: headingType,
          content: inlineToMarkdown(node.children),
        },
      ];
    }
    case "paragraph":
      return [
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          content: inlineToMarkdown(node.children),
        },
      ];
    case "thematic_break":
      return [{ id: crypto.randomUUID(), type: "divider", content: "" }];
    case "blockquote":
      return [
        {
          id: crypto.randomUUID(),
          type: "quote",
          content: node.children.map((c) => blockToMarkdown(c)).join("\n"),
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
      return node.children.map((item) =>
        listItemToBlock("bulleted_list", item),
      );
    case "ordered_list":
      return node.children.map((item) =>
        listItemToBlock("numbered_list", item),
      );
    case "task_list":
      return node.children.map((item) =>
        listItemToBlock("to_do", item, item.checked),
      );
    case "callout":
      return [
        {
          id: crypto.randomUUID(),
          type: "callout" as BlockType,
          content: node.children.map((c) => blockToMarkdown(c)).join("\n"),
        },
      ];
    case "table": {
      const header = node.head.cells.map((cell) =>
        inlineToMarkdown(cell.children),
      );
      const rows = node.rows.map((row) =>
        row.cells.map((cell) => inlineToMarkdown(cell.children)),
      );

      return [
        {
          id: crypto.randomUUID(),
          type: "table_block",
          content: "",
          tableData: [header, ...rows],
        },
      ];
    }
    default:
      return [];
  }
}

type ListItemNodeLike = {
  children: BlockNode[];
  checked?: boolean;
};

function listItemToBlock(
  type: "bulleted_list" | "numbered_list" | "to_do",
  item: ListItemNodeLike,
  checked?: boolean,
): Block {
  const nestedBlocks = item.children.flatMap((child) => {
    if (
      child.type === "ordered_list" ||
      child.type === "unordered_list" ||
      child.type === "task_list"
    ) {
      return astToBlocks(child);
    }

    return [];
  });

  const block: Block = {
    id: crypto.randomUUID(),
    type,
    content: item.children.map((child) => blockToMarkdown(child)).join("\n"),
  };

  if (checked !== undefined) {
    block.checked = checked;
  }

  if (nestedBlocks.length > 0) {
    block.children = nestedBlocks;
  }

  return block;
}

/**
 * Reconstruct markdown source from inline AST nodes, preserving
 * formatting delimiters so the editor can re-parse them for rendering.
 */
function inlineToMarkdown(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return n.value;
        case "bold":
          return `**${inlineToMarkdown(n.children)}**`;
        case "italic":
          return `*${inlineToMarkdown(n.children)}*`;
        case "bold_italic":
          return `***${inlineToMarkdown(n.children)}***`;
        case "strikethrough":
          return `~~${inlineToMarkdown(n.children)}~~`;
        case "underline":
          return `__${inlineToMarkdown(n.children)}__`;
        case "highlight":
          return `==${inlineToMarkdown(n.children)}==`;
        case "text_color":
          return `[color=${n.color}]${inlineToMarkdown(n.children)}[/color]`;
        case "background_color":
          return `[bg=${n.color}]${inlineToMarkdown(n.children)}[/bg]`;
        case "code_rich":
          return `[code]${inlineToMarkdown(n.children)}[/code]`;
        case "code":
          return `\`${n.value}\``;
        case "link": {
          const label = inlineToMarkdown(n.children);
          const title = n.title ? ` "${n.title}"` : "";
          return `[${label}](${n.href}${title})`;
        }
        case "image": {
          const title = n.title ? ` "${n.title}"` : "";
          return `![${n.alt}](${n.src}${title})`;
        }
        case "emoji":
          return `:${n.raw}:`;
        case "line_break":
          return "\n";
        case "math_inline":
          return `$${n.value}$`;
        case "footnote_ref":
          return `[^${n.label}]`;
        case "internal_link":
          return `[[page:${n.pageId}]]`;
        default:
          return "";
      }
    })
    .join("");
}
