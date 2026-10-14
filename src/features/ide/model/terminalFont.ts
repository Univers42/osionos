/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   terminalFont.ts                                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// xterm measures its cell on a canvas, and a canvas font cannot hold var(): given
// 'var(--osio-font-family-mono)' it measured its default 10px sans-serif and then padded
// every glyph of the real monospace face with letter-spacing up to that width (stretched
// terminal text, seen live 2026-10-14). It gets the token's resolved font list instead.

const FALLBACK = "monospace";

export function terminalFontFamily(style: Pick<CSSStyleDeclaration, "getPropertyValue">): string {
  const family = style.getPropertyValue("--osio-font-family-mono").trim();
  return family && !family.includes("var(") ? family : FALLBACK;
}
