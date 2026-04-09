// HTML Renderer — AST → HTML string
//
//

import type { BlockNode, InlineNode } from "../ast";

export interface HtmlRenderOptions {
  wrapperClass?: string;
  externalLinks?: boolean;
  classPrefix?: string;
  sanitizeHtml?: boolean;
}

const defaults: Required<HtmlRenderOptions> = {
  wrapperClass: "",
  externalLinks: true,
  classPrefix: "md",
  sanitizeHtml: false,
};

export function renderHtml(
  blocks: BlockNode[],
  opts?: HtmlRenderOptions,
): string {
  const o = { ...defaults, ...opts };
  const inner = blocks.map((b) => renderBlock(b, o)).join("\n");
  if (o.wrapperClass) {
    return `<article class="${esc(o.wrapperClass)}">\n${inner}\n</article>`;
  }
  return inner;
}

function renderBlock(node: BlockNode, o: Required<HtmlRenderOptions>): string {
  switch (node.type) {
    case "document":
      return node.children.map((c) => renderBlock(c, o)).join("\n");

    case "paragraph":
      return `<p>${renderInlines(node.children, o)}</p>`;

    case "heading": {
      const tag = `h${node.level}`;
      const id = node.id ? ` id="${esc(node.id)}"` : "";
      return `<${tag}${id}>${renderInlines(node.children, o)}</${tag}>`;
    }

    case "blockquote":
      return `<blockquote>\n${node.children.map((c) => renderBlock(c, o)).join("\n")}\n</blockquote>`;

    case "code_block": {
      const langClass = node.lang ? ` class="language-${esc(node.lang)}"` : "";
      const metaAttr = node.meta ? ` data-meta="${esc(node.meta)}"` : "";
      return `<pre${metaAttr}><code${langClass}>${esc(node.value)}</code></pre>`;
    }

    case "unordered_list":
      return `<ul>\n${node.children
        .map(
          (c) =>
            `<li>${c.children.map((b) => renderBlock(b, o)).join("\n")}</li>`,
        )
        .join("\n")}\n</ul>`;

    case "ordered_list": {
      const start = node.start === 1 ? "" : ` start="${node.start}"`;
      return `<ol${start}>\n${node.children
        .map(
          (c) =>
            `<li>${c.children.map((b) => renderBlock(b, o)).join("\n")}</li>`,
        )
        .join("\n")}\n</ol>`;
    }

    case "task_list":
      return `<ul class="${o.classPrefix}-task-list">\n${node.children
        .map((item) => {
          const checked = item.checked ? " checked disabled" : " disabled";
          const inner = renderTaskItemContent(item.children, o);
          return `<li class="${o.classPrefix}-task-item"><input type="checkbox"${checked} />${inner}</li>`;
        })
        .join("\n")}\n</ul>`;

    case "thematic_break":
      return "<hr />";

    case "table":
      return renderTable(node, o);

    case "callout": {
      const cls = `${o.classPrefix}-callout ${o.classPrefix}-callout-${node.kind}`;
      const title = node.title.length
        ? `<div class="${o.classPrefix}-callout-title">${renderInlines(node.title, o)}</div>\n`
        : "";
      const body = node.children.map((c) => renderBlock(c, o)).join("\n");
      return `<div class="${cls}">\n${title}${body}\n</div>`;
    }

    case "math_block":
      return `<div class="${o.classPrefix}-math-block">${esc(node.value)}</div>`;

    case "html_block":
      return o.sanitizeHtml ? `<!-- sanitized html block -->` : node.value;

    case "footnote_def": {
      const id = `fn-${esc(node.label)}`;
      const body = node.children.map((c) => renderBlock(c, o)).join("\n");
      return `<div id="${id}" class="${o.classPrefix}-footnote">\n<sup>${esc(node.label)}</sup>\n${body}\n</div>`;
    }

    case "definition_list": {
      const items = node.items
        .map(
          (item) =>
            `<dt>${renderInlines(item.term, o)}</dt>\n` +
            item.definitions
              .map((def) => `<dd>${renderInlines(def, o)}</dd>`)
              .join("\n"),
        )
        .join("\n");
      return `<dl>\n${items}\n</dl>`;
    }

    case "toggle": {
      const summary = renderInlines(node.summary, o);
      const body = node.children.map((c) => renderBlock(c, o)).join("\n");
      return `<details>\n<summary>${summary}</summary>\n${body}\n</details>`;
    }

    default:
      return "";
  }
}

function renderTaskItemContent(
  nodes: BlockNode[],
  o: Required<HtmlRenderOptions>,
): string {
  // Keep the most common case compact so task text stays on the same visual line.
  if (nodes.length === 1 && nodes[0].type === "paragraph") {
    return renderInlines(nodes[0].children, o);
  }
  return nodes.map((b) => renderBlock(b, o)).join("\n");
}

function renderTable(
  node: Extract<BlockNode, { type: "table" }>,
  o: Required<HtmlRenderOptions>,
): string {
  const alignStyle = (i: number): string => {
    const a = node.alignments[i];
    return a ? ` style="text-align:${a}"` : "";
  };

  const headCells = node.head.cells
    .map((c, i) => `<th${alignStyle(i)}>${renderInlines(c.children, o)}</th>`)
    .join("");

  const bodyRows = node.rows
    .map(
      (row) =>
        "<tr>" +
        row.cells
          .map(
            (c, i) =>
              `<td${alignStyle(i)}>${renderInlines(c.children, o)}</td>`,
          )
          .join("") +
        "</tr>",
    )
    .join("\n");

  return `<table>\n<thead><tr>${headCells}</tr></thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`;
}

function renderInlines(
  nodes: InlineNode[],
  o: Required<HtmlRenderOptions>,
): string {
  return nodes.map((n) => renderInline(n, o)).join("");
}

function renderInline(
  node: InlineNode,
  o: Required<HtmlRenderOptions>,
): string {
  const inlineCodeStyle =
    "background:var(--color-surface-tertiary-soft2);border:1px solid var(--color-line);border-radius:6px;padding:0 0.35em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.92em;color:var(--color-ink-strong);";
  switch (node.type) {
    case "text":
      return esc(node.value);
    case "bold":
      return `<strong>${renderInlines(node.children, o)}</strong>`;
    case "italic":
      return `<em style="font-style:italic">${renderInlines(node.children, o)}</em>`;
    case "bold_italic":
      return `<strong><em style="font-style:italic">${renderInlines(node.children, o)}</em></strong>`;
    case "strikethrough":
      return `<del>${renderInlines(node.children, o)}</del>`;
    case "underline":
      return `<u>${renderInlines(node.children, o)}</u>`;
    case "code":
      return `<code class="inline-code" style="${inlineCodeStyle}">${esc(node.value)}</code>`;
    case "link": {
      const attrs = [
        `href="${esc(node.href)}"`,
        node.title ? `title="${esc(node.title)}"` : "",
        o.externalLinks && isExternal(node.href)
          ? 'target="_blank" rel="noopener noreferrer"'
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<a ${attrs}>${renderInlines(node.children, o)}</a>`;
    }
    case "image": {
      const titleAttr = node.title ? ` title="${esc(node.title)}"` : "";
      return `<img src="${esc(node.src)}" alt="${esc(node.alt)}"${titleAttr} />`;
    }
    case "line_break":
      return "<br />";
    case "highlight":
      return `<mark>${renderInlines(node.children, o)}</mark>`;
    case "math_inline":
      return `<span class="${o.classPrefix}-math-inline">${esc(node.value)}</span>`;
    case "footnote_ref":
      return `<sup><a href="#fn-${esc(node.label)}">[${esc(node.label)}]</a></sup>`;
    case "emoji":
      return node.value;
    default:
      return "";
  }
}

function esc(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}
