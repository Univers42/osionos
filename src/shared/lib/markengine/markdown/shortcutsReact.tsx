/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   shortcutsReact.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type React from "react";
import { parseInline } from "./parser";
import { renderInlines, type ReactRenderOptions } from "./renderers/react";

export function renderInlineToReact(
  text: string,
  options: ReactRenderOptions = {},
): React.ReactNode {
  const nodes = parseInline(text);
  return renderInlines(nodes, {
    ...options,
    classPrefix: options.classPrefix ?? "md",
    externalLinks: options.externalLinks ?? true,
  });
}
