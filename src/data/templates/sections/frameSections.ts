// The sections that frame a page: navigation, hero, page header and footer.

import type { Block } from '@/entities/block';
import { divider, p } from '../../seedBlockHelpers';
import { action, band, buttonPair, column, container, equalColumns, headingOf, image } from './sectionBlocks';

/** A top bar: the site name on the left, its links and one action on the right. */
export function navSection(): Block[] {
  return [
    container({ layout: 'row', gap: 4, align: 'center', justify: 'between', stackAt: 'mobile' }, [
      column([p('**Your name**')], 0.4),
      column([p('[Work](#work) · [About](#about) · [Contact](#contact)')], 0.4),
      column([action('Get in touch')], 0.2),
    ]),
    divider(),
  ];
}

/** The opening statement: a headline, a lead, two actions, and a picture beside it. */
export function heroSection(): Block[] {
  return [
    container({ layout: 'row', gap: 8, align: 'center', stackAt: 'tablet' }, [
      column([
        headingOf(1, 'Say what you do in one line'),
        p('One or two sentences on who it is for and why it matters. Keep it short enough to read at a glance.'),
        buttonPair('Get started', 'Learn more'),
      ], 0.55),
      column([image('Hero picture')], 0.45),
    ]),
  ];
}

/** A page's title band: an eyebrow, the title and a one-paragraph summary. */
export function pageHeaderSection(): Block[] {
  return [
    band([
      p('*Section · Updated today*'),
      headingOf(1, 'Page title'),
      p('A summary of what this page covers, in one paragraph.'),
    ], { surface: 'subtle', padding: 6, radius: 'panel' }),
  ];
}

/** The closing band: link groups in columns, then the small print. */
export function footerSection(): Block[] {
  return [
    divider(),
    container({ layout: 'grid', cols: 4, minCol: 10, gap: 6, stackAt: 'mobile' }, equalColumns([
      [p('**Your name**'), p('A line about you or your project.')],
      [p('**Product**'), p('[Features](#) · [Pricing](#)')],
      [p('**Company**'), p('[About](#) · [Careers](#)')],
      [p('**Contact**'), p('[hello@example.com](mailto:hello@example.com)')],
    ])),
    p('*© Your name. All rights reserved.*'),
  ];
}
