// React renderer — table, inline, and helper functions
import React from "react";
import type { BlockNode, InlineNode } from "../ast";

export function renderTable(
  node: Extract<BlockNode, { type: "table" }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  o: any,
  key: number | string,
): React.ReactElement {
  const alignStyle = (i: number): React.CSSProperties | undefined => {
    const a = node.alignments[i];
    return a ? { textAlign: a } : undefined;
  };

  const headCells = node.head.cells.map((c, idx) => ({ c, idx }));
  const thead = React.createElement(
    "thead",
    null,
    React.createElement(
      "tr",
      null,
      ...headCells.map(({ c, idx }) =>
        React.createElement(
          "th",
          { key: `h-${idx}`, style: alignStyle(idx) },
          ...renderInlines(c.children, o),
        ),
      ),
    ),
  );

  const rowEntries = node.rows.map((row, idx) => ({
    idx,
    cells: row.cells.map((c, ci) => ({ c, ci })),
  }));
  const tbody = React.createElement(
    "tbody",
    null,
    ...rowEntries.map(({ idx: ri, cells }) =>
      React.createElement(
        "tr",
        { key: `r-${ri}` },
        ...cells.map(({ c, ci }) =>
          React.createElement(
            "td",
            { key: `c-${ci}`, style: alignStyle(ci) },
            ...renderInlines(c.children, o),
          ),
        ),
      ),
    ),
  );

  return React.createElement("table", { key }, thead, tbody);
}

// INLINE RENDERING

export function renderInlines(
  nodes: InlineNode[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  o: any,
): React.ReactNode[] {
  return nodes.map((n, i) => renderInlineNode(n, o, i));
}

export function renderInlineNode(
  node: InlineNode,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  o: any,
  key: number | string,
): React.ReactNode {
  const inlineCodeStyle: React.CSSProperties = {
    background: "var(--color-surface-tertiary-soft2)",
    border: "1px solid var(--color-line)",
    borderRadius: "6px",
    padding: "0 0.35em",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "0.92em",
    color: "var(--color-ink-strong)",
  };

  switch (node.type) {
    case "text":
      return node.value;

    case "bold":
      return React.createElement(
        "strong",
        { key },
        ...renderInlines(node.children, o),
      );

    case "italic":
      return React.createElement(
        "em",
        { key, style: { fontStyle: "italic" } },
        ...renderInlines(node.children, o),
      );

    case "bold_italic":
      return React.createElement(
        "strong",
        { key },
        React.createElement(
          "em",
          { style: { fontStyle: "italic" } },
          ...renderInlines(node.children, o),
        ),
      );

    case "strikethrough":
      return React.createElement(
        "del",
        { key },
        ...renderInlines(node.children, o),
      );

    case "underline":
      return React.createElement(
        "u",
        { key },
        ...renderInlines(node.children, o),
      );

    case "code":
      return React.createElement(
        "code",
        { key, className: "inline-code", style: inlineCodeStyle },
        node.value,
      );

    case "link": {
      const isExt = isExternal(node.href);
      const props: Record<string, unknown> = {
        key,
        href: node.href,
        title: node.title || undefined,
        ...(o.externalLinks && isExt
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {}),
      };
      return React.createElement(
        "a",
        props,
        ...renderInlines(node.children, o),
      );
    }

    case "image": {
      if (o.imageRenderer) {
        return o.imageRenderer(node.src, node.alt, node.title);
      }
      return React.createElement("img", {
        key,
        src: node.src,
        alt: node.alt,
        title: node.title || undefined,
      });
    }

    case "line_break":
      return React.createElement("br", { key });

    case "highlight":
      return React.createElement(
        "mark",
        { key },
        ...renderInlines(node.children, o),
      );

    case "math_inline": {
      if (o.mathRenderer) {
        return o.mathRenderer(node.value, false);
      }
      return React.createElement(
        "span",
        { key, className: `${o.classPrefix}-math-inline` },
        node.value,
      );
    }

    case "footnote_ref":
      return React.createElement(
        "sup",
        { key },
        React.createElement(
          "a",
          { href: `#fn-${node.label}` },
          `[${node.label}]`,
        ),
      );

    case "emoji":
      return React.createElement(
        "span",
        { key, role: "img", "aria-label": node.raw, title: `:${node.raw}:` },
        node.value,
      );

    default:
      return null;
  }
}

// HELPERS

export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href);
}
