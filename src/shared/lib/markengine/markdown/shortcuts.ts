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

function isListBlock(node: BlockNode): boolean {
  return (
    node.type === "ordered_list" ||
    node.type === "unordered_list" ||
    node.type === "task_list"
  );
}

function listItemToBlock(
  type: "bulleted_list" | "numbered_list" | "to_do",
  item: ListItemNodeLike,
  checked?: boolean,
): Block {
  const nestedBlocks = item.children.flatMap((child) => {
    if (isListBlock(child)) {
      return astToBlocks(child);
    }

    return [];
  });
  const content = item.children
    .filter((child) => !isListBlock(child))
    .map((child) => blockToMarkdown(child))
    .filter(Boolean)
    .join("\n");

  const block: Block = {
    id: crypto.randomUUID(),
    type,
    content,
  };

  if (checked !== undefined) {
    block.checked = checked;
  }

  if (nestedBlocks.length > 0) {
    block.children = nestedBlocks;
  }

  return block;
}

function renderMarkdownListItemBody(item: ListItemNodeLike): string {
  return item.children.map((child) => blockToMarkdown(child)).join("\n");
}

function indentMarkdownContinuation(markdown: string, prefixLength: number): string {
  const continuationPrefix = " ".repeat(prefixLength);
  return markdown
    .split("\n")
    .map((line, index) => (index === 0 ? line : `${continuationPrefix}${line}`))
    .join("\n");
}

function blockToMarkdown(node: BlockNode): string {
  switch (node.type) {
    case "document":
      return node.children.map((child) => blockToMarkdown(child)).join("\n\n");
    case "paragraph":
      return inlineToMarkdown(node.children);
    case "heading":
      return `${"#".repeat(node.level)} ${inlineToMarkdown(node.children)}`;
    case "thematic_break":
      return "---";
    case "blockquote":
      return node.children
        .map((child) => blockToMarkdown(child))
        .join("\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "code_block": {
      const info = [node.lang, node.meta].filter(Boolean).join(" ");
      return `\`\`\`${info}\n${node.value}\n\`\`\``;
    }
    case "ordered_list":
      return node.children
        .map((item, index) => {
          const prefix = `${node.start + index}. `;
          const body = renderMarkdownListItemBody(item);
          return `${prefix}${indentMarkdownContinuation(body, prefix.length)}`;
        })
        .join("\n");
    case "unordered_list":
      return node.children
        .map((item) => {
          const prefix = "- ";
          const body = renderMarkdownListItemBody(item);
          return `${prefix}${indentMarkdownContinuation(body, prefix.length)}`;
        })
        .join("\n");
    case "task_list":
      return node.children
        .map((item) => {
          const prefix = `- [${item.checked ? "x" : " "}] `;
          const body = renderMarkdownListItemBody(item);
          return `${prefix}${indentMarkdownContinuation(body, prefix.length)}`;
        })
        .join("\n");
    case "list_item":
      return renderMarkdownListItemBody(node);
    case "table": {
      const header = `| ${node.head.cells
        .map((cell) => inlineToMarkdown(cell.children))
        .join(" | ")} |`;
      const separator = `| ${node.alignments
        .map((alignment) => {
          if (alignment === "left") return ":---";
          if (alignment === "right") return "---:";
          if (alignment === "center") return ":---:";
          return "---";
        })
        .join(" | ")} |`;
      const rows = node.rows.map(
        (row) =>
          `| ${row.cells
            .map((cell) => inlineToMarkdown(cell.children))
            .join(" | ")} |`,
      );
      return [header, separator, ...rows].join("\n");
    }
    case "callout": {
      const title = inlineToMarkdown(node.title);
      const opening = title ? `> [!${node.kind}] ${title}` : `> [!${node.kind}]`;
      const body = node.children
        .map((child) => blockToMarkdown(child))
        .join("\n")
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
      return body ? `${opening}\n${body}` : opening;
    }
    case "math_block":
      return `$$\n${node.value}\n$$`;
    case "html_block":
      return node.value;
    case "footnote_def":
      return `[^${node.label}]: ${node.children.map((child) => blockToMarkdown(child)).join("\n")}`;
    case "definition_list":
      return node.items
        .map((item) => {
          const term = inlineToMarkdown(item.term);
          const definitions = item.definitions.map(
            (definition) => `: ${inlineToMarkdown(definition)}`,
          );
          return [term, ...definitions].join("\n");
        })
        .join("\n");
    case "toggle": {
      const summary = inlineToMarkdown(node.summary);
      const body = node.children.map((child) => blockToMarkdown(child)).join("\n");
      return body ? `> [toggle] ${summary}\n${body}` : `> [toggle] ${summary}`;
    }
    default:
      return "";
  }
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
