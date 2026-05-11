import type React from "react";
import { parseInline } from "./parser";
import { renderInlines, type ReactRenderOptions } from "./renderers/react";

export function renderInlineToReact(
  text: string,
  options: ReactRenderOptions = {},
): React.ReactNode {
  const nodes = parseInline(text);
  return renderInlines(nodes, options);
}
