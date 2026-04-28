/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineSource.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:21:24 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:21:29 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { parseInline } from "./markdown/index";
import { normalizeInlineNodes, serializeInlineNodes } from "./inlineAst";

/** Normalize inline markdown into a canonical serialized form. */
export function normalizeInlineSource(source: string): string {
  const nodes = normalizeInlineNodes(parseInline(source));
  return serializeInlineNodes(nodes);
}
