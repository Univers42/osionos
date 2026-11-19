// Block builders the page sections are made of. A section is a plain Block[] built
// from what every reader already knows: a styled `column_list` (ADR 0064 PS6
// container modes) holding `column`s, plus headings, paragraphs, buttons and empty
// image slots. No `placeholder` block: the markdown path reads one back as a
// paragraph, which breaks the PS21 round trip; sample copy the user overwrites
// does the same job.

import type { Block, BlockStyle } from '@/entities/block';
import { bid, h1, h2, h3, p } from '../../seedBlockHelpers';

export type ContainerStyle = Pick<
  BlockStyle,
  'layout' | 'cols' | 'minCol' | 'stackAt' | 'wrap' | 'gap' | 'align' | 'justify' | 'padding' | 'surface' | 'radius'
>;
export type ColumnStyle = Pick<BlockStyle, 'span' | 'surface' | 'padding' | 'radius' | 'border' | 'align'>;

/** A column of a container; `ratio` is its share of a row. */
export function column(children: Block[], ratio: number, style?: ColumnStyle): Block {
  return { id: bid(), type: 'column', content: '', widthRatio: ratio, children, ...(style ? { style } : {}) };
}

/** A styled column_list: the one container every section is laid out with. */
export function container(style: ContainerStyle, columns: Block[]): Block {
  return { id: bid(), type: 'column_list', content: '', style, children: columns };
}

/** Equal columns, each holding one group of blocks. */
export function equalColumns(groups: Block[][], style?: ColumnStyle): Block[] {
  const ratio = groups.length > 0 ? Math.round(100 / groups.length) / 100 : 1;
  return groups.map((group) => column(group, ratio, style));
}

/** A responsive grid of cards: auto-fills at `minCol` rem, never more than `cols`. */
export function cardGrid(groups: Block[][], cols: ContainerStyle['cols'], minCol: ContainerStyle['minCol'] = 16): Block {
  return container(
    { layout: 'grid', cols, minCol, gap: 4, stackAt: 'mobile' },
    equalColumns(groups, CARD),
  );
}

/** A full-width band that stacks its blocks (a section's frame). */
export function band(children: Block[], style: ContainerStyle = {}): Block {
  return container({ layout: 'stack', gap: 3, ...style }, [column(children, 1)]);
}

/** A card surface for a column. */
export const CARD: ColumnStyle = { surface: 'muted', padding: 5, radius: 'panel' };

/** An empty image slot the user fills; `asset: ''` is what the markdown path reads back. */
export function image(alt: string): Block {
  return { id: bid(), type: 'image', content: '', asset: '', mediaAlt: alt };
}

/** A heading by level, so section builders pick the level from the shell's outline. */
export function headingOf(level: 1 | 2 | 3, text: string): Block {
  if (level === 1) return h1(text);
  return level === 2 ? h2(text) : h3(text);
}

/** A section title with its one-line lead. */
export function sectionTitle(title: string, lead: string): Block[] {
  return [h2(title), p(lead)];
}

/** A button; unlike the seed helper it writes no `buttonHref` key when there is no link,
 *  so the block equals its own .omd round trip. */
export function action(label: string, variant: 'primary' | 'secondary' = 'primary', href?: string): Block {
  return { id: bid(), type: 'button', content: '', buttonLabel: label, buttonVariant: variant, ...(href ? { buttonHref: href } : {}) };
}

/** A primary and a secondary call to action, side by side. */
export function buttonPair(primary: string, secondary: string): Block {
  return container(
    { layout: 'row', gap: 3, wrap: 'wrap', stackAt: 'never' },
    [column([action(primary)], 0.5), column([action(secondary, 'secondary')], 0.5)],
  );
}

/** A card's text: its title over one line of body. */
export function card(title: string, body: string): Block[] {
  return [h3(title), p(body)];
}
