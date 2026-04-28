/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   parserBlockContext.ts                              :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:23:02 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/28 22:23:03 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Markdown parser — parse context and cursor utilities
export interface ParseContext {
  lines: string[];
  pos: number;
}

export function peek(ctx: ParseContext): string | null {
  return ctx.pos < ctx.lines.length ? ctx.lines[ctx.pos] : null;
}

export function advance(ctx: ParseContext): string {
  return ctx.lines[ctx.pos++];
}
