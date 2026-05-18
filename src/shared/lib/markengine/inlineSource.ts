/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   inlineSource.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:17 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

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

import { parseInline } from "./markdown/parser";
import { normalizeInlineNodes, serializeInlineNodes } from "./inlineAst";

/** Normalize inline markdown into a canonical serialized form. */
export function normalizeInlineSource(source: string): string {
  const nodes = normalizeInlineNodes(parseInline(source));
  return serializeInlineNodes(nodes);
}
