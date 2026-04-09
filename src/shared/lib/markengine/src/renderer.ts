import {
  BlockNode,
  DocumentNode,
  InlineNode,
  ListItemNode,
  ListNode,
} from "./types";
import { escapeHtml } from "./utils";

function renderInlines(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
          return escapeHtml(node.value);
        case "emphasis":
          return `<em data-node-id="${node.id}">${renderInlines(node.children)}</em>`;
        case "strong":
          return `<strong data-node-id="${node.id}">${renderInlines(node.children)}</strong>`;
        case "code_span":
          return `<code data-node-id="${node.id}" class="md-inline-code">${escapeHtml(node.value)}</code>`;
        case "link":
          return `<a data-node-id="${node.id}" href="${escapeHtml(node.href)}">${renderInlines(node.children)}</a>`;
        default:
          return "";
      }
    })
    .join("");
}

function renderListItem(item: ListItemNode): string {
  const checkedAttr =
    typeof item.checked === "boolean"
      ? ` data-checked="${String(item.checked)}"`
      : "";
  const content = item.children.map(renderBlock).join("");
  return `<li data-node-id="${item.id}"${checkedAttr}>${content}</li>`;
}

function renderList(node: ListNode): string {
  const tag = node.ordered ? "ol" : "ul";
  const start = node.ordered && node.start > 1 ? ` start="${node.start}"` : "";
  return `<${tag} data-node-id="${node.id}"${start}>${node.items.map(renderListItem).join("")}</${tag}>`;
}

function renderBlock(node: BlockNode): string {
  switch (node.kind) {
    case "paragraph":
      return `<p data-node-id="${node.id}">${renderInlines(node.children)}</p>`;
    case "heading":
      return `<h${node.depth} data-node-id="${node.id}">${renderInlines(node.children)}</h${node.depth}>`;
    case "code_block": {
      const languageClass = node.language
        ? ` language-${escapeHtml(node.language)}`
        : "";
      return `<pre data-node-id="${node.id}" class="md-code-block${languageClass}"><code>${escapeHtml(node.value)}</code></pre>`;
    }
    case "list":
      return renderList(node);
    case "blockquote":
      return `<blockquote data-node-id="${node.id}">${node.children.map(renderBlock).join("")}</blockquote>`;
    case "thematic_break":
      return `<hr data-node-id="${node.id}" />`;
    case "list_item":
      return renderListItem(node);
    default:
      return "";
  }
}

export function renderHtml(ast: DocumentNode): string {
  return ast.children.map(renderBlock).join("\n");
}
