// The sections that show what something offers: features, bento, logos, numbers
// and a side-by-side comparison.

import type { Block } from '@/entities/block';
import { bullet, h3, p } from '../../seedBlockHelpers';
import { CARD, card, cardGrid, column, container, headingOf, image, sectionTitle } from './sectionBlocks';

/** Three to six features as cards in a grid that wraps on narrow screens. */
export function featureGridSection(): Block[] {
  return [
    ...sectionTitle('Features', 'What makes it worth using, one card each.'),
    cardGrid([
      card('Fast', 'Say what this feature does for the reader, not how it works.'),
      card('Simple', 'One sentence per card keeps the grid easy to scan.'),
      card('Yours', 'Swap these cards for the three things you do best.'),
    ], 3),
  ];
}

/** Bento: one large tile beside smaller ones, spans set per tile. */
export function bentoSection(): Block[] {
  return [
    ...sectionTitle('Highlights', 'A big tile for the headline, small tiles for the rest.'),
    container({ layout: 'grid', cols: 3, minCol: 12, gap: 4, stackAt: 'mobile' }, [
      column([image('Main highlight'), ...card('The main thing', 'Lead with what matters most.')], 0.67, { ...CARD, span: 2 }),
      column(card('Detail', 'A supporting point.'), 0.33, CARD),
      column(card('Detail', 'Another supporting point.'), 0.33, CARD),
      column(card('Detail', 'One more, kept short.'), 0.67, { ...CARD, span: 2 }),
    ]),
  ];
}

/** A row of logos, or names, of the people who use or back it. */
export function logoCloudSection(): Block[] {
  return [
    p('*Trusted by teams at*'),
    container({ layout: 'grid', cols: 6, minCol: 10, gap: 4, align: 'center', stackAt: 'never' }, [
      column([image('Logo')], 0.17), column([image('Logo')], 0.17), column([image('Logo')], 0.17),
      column([image('Logo')], 0.17), column([image('Logo')], 0.17), column([image('Logo')], 0.17),
    ]),
  ];
}

/** Key numbers, each a big figure over its label. */
export function statsSection(): Block[] {
  const stat = (figure: string, label: string): Block[] => [headingOf(1, figure), p(label)];
  return [
    cardGrid([stat('10k+', 'People reached'), stat('98%', 'Would recommend'), stat('24/7', 'Availability'), stat('5', 'Years running')], 4, 10),
  ];
}

/** Two options compared point by point. */
export function comparisonSection(): Block[] {
  const side = (title: string, points: string[]): Block[] => [h3(title), ...points.map((point) => bullet(point))];
  return [
    ...sectionTitle('How it compares', 'The same questions, answered for each option.'),
    container({ layout: 'row', gap: 4, stackAt: 'mobile' }, [
      column(side('Before', ['Takes a full day', 'Needs three tools', 'Easy to get wrong']), 0.5, CARD),
      column(side('After', ['Takes ten minutes', 'One place for everything', 'Checked as you go']), 0.5, { ...CARD, surface: 'accent' }),
    ]),
  ];
}
