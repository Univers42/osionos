/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageHeadingFont.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageFont } from './pageConfigStore';

type HeadingFontVars = Partial<Record<'--osio-font-heading' | '--osio-font-display', string>>;

// Headings use --osio-font-heading and the title --osio-font-display (type.css), so the
// page font has to override both or a Serif/Mono page keeps the theme's headings. The
// tokens point at the root's serif/mono stacks, which never read these two names back.
// Default keeps the theme's own pairing.
const HEADING_TOKEN: Partial<Record<PageFont, string>> = {
  serif: 'var(--osio-font-family-serif)',
  mono: 'var(--osio-font-family-mono)',
};

export function pageHeadingFontVars(font: PageFont): HeadingFontVars {
  const token = HEADING_TOKEN[font];
  return token ? { '--osio-font-heading': token, '--osio-font-display': token } : {};
}
