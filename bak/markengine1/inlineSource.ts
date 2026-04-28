/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineSource.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: rstancu <rstancu@student.42madrid.com>     +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/18 13:40:00 by rstancu          #+#    #+#             */
/*   Updated: 2026/04/18 13:40:00 by rstancu          ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { parseInline } from "./markdown/index";
import { normalizeInlineNodes, serializeInlineNodes } from "./inlineAst";

/** Normalize inline markdown into a canonical serialized form. */
export function normalizeInlineSource(source: string): string {
  const nodes = normalizeInlineNodes(parseInline(source));
  return serializeInlineNodes(nodes);
}
