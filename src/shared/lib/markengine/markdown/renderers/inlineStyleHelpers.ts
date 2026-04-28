import type { InlineNode } from "../ast";

export type InlineStyleMap = Record<string, string>;

const INLINE_CODE_STYLE_MAP = {
  backgroundColor:
    "var(--inline-code-background,var(--color-surface-tertiary-soft2))",
  border: "1px solid var(--color-line)",
  borderRadius: "6px",
  padding: "0 0.35em",
  fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  fontSize: "0.92em",
  color: "var(--inline-code-color,currentColor)",
  textDecorationColor: "var(--inline-code-decoration-color,currentColor)",
  ["--inline-background-fill" as const]: "transparent",
  ["--inline-background-padding" as const]: "0",
  ["--inline-background-radius" as const]: "0",
} satisfies InlineStyleMap;

export const INLINE_CODE_STYLE = styleMapToCss(INLINE_CODE_STYLE_MAP);

const INLINE_BACKGROUND_RADIUS = "0.18em";
const INLINE_BACKGROUND_PADDING = "0";

export function getInlineBackgroundStyle(
  color: string,
  suppressBackground: boolean,
) {
  return {
    backgroundColor: `var(--inline-background-fill, ${color}33)`,
    borderRadius: `var(--inline-background-radius, ${INLINE_BACKGROUND_RADIUS})`,
    padding: `var(--inline-background-padding, ${INLINE_BACKGROUND_PADDING})`,
    boxDecorationBreak: "clone",
    WebkitBoxDecorationBreak: "clone",
    ["--inline-code-background" as const]: `${color}33`,
    ...(suppressBackground
      ? {
          ["--inline-background-fill" as const]: "transparent",
          ["--inline-background-padding" as const]: "0",
          ["--inline-background-radius" as const]: "0",
        }
      : {}),
  } satisfies Record<string, string>;
}

export function getInlineBackgroundCss(
  color: string,
  suppressBackground: boolean,
) {
  return styleMapToCss(getInlineBackgroundStyle(color, suppressBackground));
}

/**
 * Returns the shared text-color style map used by the HTML and React renderers.
 */
export function getInlineTextColorStyle(color: string) {
  return {
    color,
    textDecorationColor: color,
    ["--inline-code-color" as const]: color,
    ["--inline-code-decoration-color" as const]: color,
  } satisfies InlineStyleMap;
}

export function getInlineTextColorCss(color: string) {
  return styleMapToCss(getInlineTextColorStyle(color));
}

/**
 * Returns the shared inline-code style map, including optional rich-code color
 * overrides extracted from nested inline wrappers.
 */
export function getInlineCodeStyle(
  textColor: string | null = null,
  backgroundColor: string | null = null,
) {
  return {
    ...INLINE_CODE_STYLE_MAP,
    ...(textColor
      ? {
          ["--inline-code-color" as const]: textColor,
          ["--inline-code-decoration-color" as const]: textColor,
        }
      : {}),
    ...(backgroundColor
      ? {
          ["--inline-code-background" as const]: `${backgroundColor}33`,
        }
      : {}),
  } satisfies InlineStyleMap;
}

export function getInlineCodeCss(
  textColor: string | null = null,
  backgroundColor: string | null = null,
) {
  return styleMapToCss(getInlineCodeStyle(textColor, backgroundColor));
}

export function unwrapCodeRichStyles(nodes: InlineNode[]) {
  return unwrapCodeRichStylesFromNodes(nodes);
}

function unwrapCodeRichStylesFromNodes(nodes: InlineNode[]): {
  nodes: InlineNode[];
  textColor: string | null;
  backgroundColor: string | null;
} {
  if (nodes.length !== 1) {
    return {
      nodes,
      textColor: null,
      backgroundColor: null,
    };
  }

  const [node] = nodes;
  switch (node.type) {
    case "text_color": {
      const unwrapped = unwrapCodeRichStylesFromNodes(node.children);
      return {
        nodes: unwrapped.nodes,
        textColor: node.color,
        backgroundColor: unwrapped.backgroundColor,
      };
    }
    case "background_color": {
      const unwrapped = unwrapCodeRichStylesFromNodes(node.children);
      return {
        nodes: unwrapped.nodes,
        textColor: unwrapped.textColor,
        backgroundColor: node.color,
      };
    }
    case "bold":
    case "italic":
    case "bold_italic":
    case "strikethrough":
    case "underline":
    case "highlight":
    case "link": {
      const unwrapped = unwrapCodeRichStylesFromNodes(node.children);
      return {
        nodes: [{ ...node, children: unwrapped.nodes }],
        textColor: unwrapped.textColor,
        backgroundColor: unwrapped.backgroundColor,
      };
    }
    default:
      return {
        nodes,
        textColor: null,
        backgroundColor: null,
      };
  }
}

export function shouldSuppressInlineBackground(nodes: InlineNode[]): boolean {
  if (nodes.length !== 1) {
    return false;
  }

  const [node] = nodes;
  switch (node.type) {
    case "code":
    case "code_rich":
      return true;
    case "bold":
    case "italic":
    case "bold_italic":
    case "strikethrough":
    case "underline":
    case "highlight":
    case "text_color":
    case "background_color":
      return shouldSuppressInlineBackground(node.children);
    default:
      return false;
  }
}

export function styleMapToCss(styleMap: InlineStyleMap) {
  return Object.entries(styleMap)
    .map(([property, value]) => `${cssPropertyName(property)}:${value};`)
    .join("");
}

function cssPropertyName(property: string) {
  if (property.startsWith("--")) {
    return property;
  }

  if (property.startsWith("Webkit")) {
    return camelCaseToKebabCase(property);
  }

  return camelCaseToKebabCase(property);
}

function camelCaseToKebabCase(value: string) {
  return value.replaceAll(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
