/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shortcuts.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown shortcuts — inline parsing and block conversion
import type { BlockType, Block } from "@/entities/block";
import { createTableBlockFromData } from "../../../../entities/block/model/tableBlocks";
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

// ─── App-block dialect ────────────────────────────────────────────────────────
//
// Blocks with no textual markdown form round-trip through markengine-native
// syntax: media as HTML blocks (`<video src>`), drawings and app embeds as
// fenced code with an `osi*` language carrying their config as JSON, and
// column layouts as `:::columns` / `:::column <ratio>` containers.

const APP_FENCE_TO_BLOCK: Record<string, BlockType> = {
  osibutton: "button",
  osidb: "database_inline",
  "osidb-page": "database_full_page",
  osigraph: "graph_view",
  osihome: "home_views",
  osilayout: "layout",
};

function safeJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `osi*` fenced blocks → their app block; null keeps the fence a code block. */
function appBlockFromFence(
  node: Extract<BlockNode, { type: "code_block" }>,
): Block | null {
  if (node.lang === "osidraw") {
    const height = /(?:^|\s)h=(\d+)\b/.exec(node.meta ?? "")?.[1];
    return {
      id: crypto.randomUUID(),
      type: "draw",
      content: node.value,
      ...(height ? { drawHeight: Number(height) } : {}),
    };
  }
  const type = APP_FENCE_TO_BLOCK[node.lang];
  if (!type) return null;
  const config = safeJsonRecord(node.value);
  if (!config) return null; // malformed JSON stays a visible code block
  const { id: _id, type: _type, children: _children, content, ...rest } = config;
  return {
    id: crypto.randomUUID(),
    type,
    content: typeof content === "string" ? content : "",
    ...rest,
  };
}

const HTML_VIDEO_RE = /^<video\s+src="([^"]*)"(?:\s+data-caption="([^"]*)")?\s*>\s*<\/video>$/;
const HTML_AUDIO_RE = /^<audio\s+src="([^"]*)"(?:\s+data-caption="([^"]*)")?\s*>\s*<\/audio>$/;
const HTML_OBJECT_RE = /^<object\s+data="([^"]*)"(?:\s+title="([^"]*)")?\s*>\s*<\/object>$/;

/** Our own serialized media HTML → media blocks; anything else stays raw. */
function mediaBlockFromHtml(value: string): Block | null {
  const trimmed = value.trim();
  const video = HTML_VIDEO_RE.exec(trimmed);
  if (video) {
    return {
      id: crypto.randomUUID(),
      type: "video",
      content: video[2] ?? "",
      asset: video[1],
    };
  }
  const audio = HTML_AUDIO_RE.exec(trimmed);
  if (audio) {
    return {
      id: crypto.randomUUID(),
      type: "audio",
      content: audio[2] ?? "",
      asset: audio[1],
    };
  }
  const object = HTML_OBJECT_RE.exec(trimmed);
  if (object) {
    return {
      id: crypto.randomUUID(),
      type: "file",
      content: object[2] ?? "",
      asset: object[1],
      ...(object[2] ? { fileName: object[2] } : {}),
    };
  }
  return null;
}

/** A paragraph that is exactly one image is an image BLOCK (Notion semantics). */
function imageBlockFromParagraph(
  node: Extract<BlockNode, { type: "paragraph" }>,
): Block | null {
  if (node.children.length !== 1) return null;
  const [only] = node.children;
  if (only.type !== "image") return null;
  return {
    id: crypto.randomUUID(),
    type: "image",
    content: only.title ?? "",
    asset: only.src,
    ...(only.alt ? { mediaAlt: only.alt } : {}),
  };
}

function containerToBlocks(
  node: Extract<BlockNode, { type: "container" }>,
): Block[] {
  if (node.kind === "columns") {
    return [
      {
        id: crypto.randomUUID(),
        type: "column_list",
        content: "",
        children: node.children.flatMap((child) => astToBlocks(child)),
      },
    ];
  }
  if (node.kind === "column") {
    const ratio = Number.parseFloat(node.params ?? "");
    return [
      {
        id: crypto.randomUUID(),
        type: "column",
        content: "",
        ...(Number.isFinite(ratio) ? { widthRatio: ratio } : {}),
        children: node.children.flatMap((child) => astToBlocks(child)),
      },
    ];
  }
  // Unknown container kinds flatten to their children — nothing is lost.
  return node.children.flatMap((child) => astToBlocks(child));
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
    case "paragraph": {
      const image = imageBlockFromParagraph(node);
      if (image) return [image];
      return [
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          content: inlineToMarkdown(node.children),
        },
      ];
    }
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
    case "code_block": {
      const appBlock = appBlockFromFence(node);
      if (appBlock) return [appBlock];
      return [
        {
          id: crypto.randomUUID(),
          type: "code",
          content: node.value,
          language: node.lang || "plaintext",
        },
      ];
    }
    case "html_block": {
      const media = mediaBlockFromHtml(node.value);
      if (media) return [media];
      // Foreign HTML keeps its source visible instead of vanishing.
      return [
        {
          id: crypto.randomUUID(),
          type: "code",
          content: node.value,
          language: "html",
        },
      ];
    }
    case "container":
      return containerToBlocks(node);
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
    case "callout": {
      const block: Block = {
        id: crypto.randomUUID(),
        type: "callout",
        content: inlineToMarkdown(node.title),
        color: node.kind,
      };
      const children = node.children.flatMap((child) => astToBlocks(child));
      if (children.length > 0) block.children = children;
      return [block];
    }
    case "toggle": {
      const block: Block = {
        id: crypto.randomUUID(),
        type: "toggle",
        content: inlineToMarkdown(node.summary),
      };
      if (node.level) block.headingLevel = node.level;
      const children = node.children.flatMap((child) => astToBlocks(child));
      if (children.length > 0) block.children = children;
      return [block];
    }
    case "math_block":
      return [{ id: crypto.randomUUID(), type: "equation", content: node.value }];
    case "front_matter":
      return []; // metadata, not content — no editor block
    case "definition_list":
      // The editor has no definition-list block: keep the source lines as
      // paragraphs so nothing is lost and the markdown round-trips.
      return node.items.flatMap((item): Block[] => [
        {
          id: crypto.randomUUID(),
          type: "paragraph",
          content: inlineToMarkdown(item.term),
        },
        ...item.definitions.map(
          (definition): Block => ({
            id: crypto.randomUUID(),
            type: "paragraph",
            content: `: ${inlineToMarkdown(definition)}`,
          }),
        ),
      ]);
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
          ...createTableBlockFromData([header, ...rows], {
            columnAlignments: node.alignments,
          }),
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
    case "front_matter":
      return `---\n${node.value}\n---`;
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
    case "container": {
      const opener = node.params ? `:::${node.kind} ${node.params}` : `:::${node.kind}`;
      const body = node.children.map((child) => blockToMarkdown(child)).join("\n\n");
      return body ? `${opener}\n${body}\n:::` : `${opener}\n:::`;
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
        case "subscript":
          return `~${inlineToMarkdown(n.children)}~`;
        case "superscript":
          return `^${inlineToMarkdown(n.children)}^`;
        case "kbd":
          return `<kbd>${inlineToMarkdown(n.children)}</kbd>`;
        case "spoiler":
          return `||${inlineToMarkdown(n.children)}||`;
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
