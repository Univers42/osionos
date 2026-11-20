/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageFontCatalog.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { PageFont } from './pageConfigStore';

export type ExtraPageFont = 'lora' | 'playfair' | 'source-serif' | 'manrope' | 'space-grotesk' | 'nunito' | 'fira-code' | 'dancing-script';

export interface PageFontFace {
  id: ExtraPageFont;
  label: string;
  kind: 'serif' | 'sans' | 'mono' | 'handwritten';
  family: string;
  file: string;
  source: string;
}

export const EXTRA_PAGE_FONTS: readonly PageFontFace[] = [
  { id: 'lora', label: 'Lora', kind: 'serif', family: '"Lora", Georgia, serif', file: 'lora-latin-wght-normal.woff2', source: 'lora:vf@latest/latin-wght-normal.woff2' },
  { id: 'playfair', label: 'Playfair', kind: 'serif', family: '"Playfair Display", Georgia, serif', file: 'playfair-display-latin-wght-normal.woff2', source: 'playfair-display:vf@latest/latin-wght-normal.woff2' },
  { id: 'source-serif', label: 'Source Serif', kind: 'serif', family: '"Source Serif 4", Georgia, serif', file: 'source-serif-4-latin-wght-normal.woff2', source: 'source-serif-4:vf@latest/latin-wght-normal.woff2' },
  { id: 'manrope', label: 'Manrope', kind: 'sans', family: '"Manrope", system-ui, sans-serif', file: 'manrope-latin-wght-normal.woff2', source: 'manrope:vf@latest/latin-wght-normal.woff2' },
  { id: 'space-grotesk', label: 'Space Grotesk', kind: 'sans', family: '"Space Grotesk", system-ui, sans-serif', file: 'space-grotesk-latin-wght-normal.woff2', source: 'space-grotesk:vf@latest/latin-wght-normal.woff2' },
  { id: 'nunito', label: 'Nunito', kind: 'sans', family: '"Nunito", system-ui, sans-serif', file: 'nunito-latin-wght-normal.woff2', source: 'nunito:vf@latest/latin-wght-normal.woff2' },
  { id: 'fira-code', label: 'Fira Code', kind: 'mono', family: '"Fira Code", ui-monospace, monospace', file: 'fira-code-latin-wght-normal.woff2', source: 'fira-code:vf@latest/latin-wght-normal.woff2' },
  { id: 'dancing-script', label: 'Dancing Script', kind: 'handwritten', family: '"Dancing Script", cursive', file: 'dancing-script-latin-wght-normal.woff2', source: 'dancing-script:vf@latest/latin-wght-normal.woff2' },
];

export function extraPageFont(font: string | undefined): PageFontFace | undefined {
  return EXTRA_PAGE_FONTS.find((face) => face.id === font);
}

export function knownPageFont(font: string | undefined): PageFont {
  if (font === 'default' || font === 'serif' || font === 'mono') return font;
  return extraPageFont(font)?.id ?? 'default';
}
