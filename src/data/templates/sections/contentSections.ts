// The sections that carry the writing itself: a post list, a content column,
// a picture gallery and a timeline.

import type { Block } from '@/entities/block';
import { bullet, callout, h2, h3, p, quote } from '../../seedBlockHelpers';
import { CARD, cardGrid, column, container, image, sectionTitle } from './sectionBlocks';

/** Recent posts as cards: a picture, a title, a date and a one-line teaser. */
export function postListSection(): Block[] {
  const post = (title: string, date: string): Block[] => [image(`Cover of ${title}`), h3(title), p(`*${date}*`), p('A one-line teaser that makes people want to read on.')];
  return [
    ...sectionTitle('Latest posts', 'What we have been writing about.'),
    cardGrid([post('First post', 'January 12'), post('Second post', 'February 3'), post('Third post', 'March 21')], 3),
  ];
}

/** A long-form body: headings, paragraphs, a list, a quote and a note. */
export function contentSection(): Block[] {
  return [
    h2('Introduction'),
    p('Open with the one idea the reader should leave with. Every later section supports it.'),
    h2('The details'),
    p('Explain step by step. Short paragraphs read better on a screen than long ones.'),
    bullet('A point worth listing'),
    bullet('Another point, kept parallel to the first'),
    quote('A line worth quoting on its own.'),
    callout('A note the reader should not miss.', '💡'),
    h2('Wrapping up'),
    p('Say what to do next, and where to find more.'),
  ];
}

/** A grid of pictures with short captions. */
export function gallerySection(): Block[] {
  const shot = (caption: string): Block[] => [image(caption), p(`*${caption}*`)];
  return [
    ...sectionTitle('Gallery', 'A few pictures that tell the story.'),
    container({ layout: 'grid', cols: 3, minCol: 12, gap: 3, stackAt: 'mobile' }, [
      column(shot('First picture'), 0.33), column(shot('Second picture'), 0.33), column(shot('Third picture'), 0.33),
      column(shot('Fourth picture'), 0.33), column(shot('Fifth picture'), 0.33), column(shot('Sixth picture'), 0.33),
    ]),
  ];
}

/** Steps or milestones in order, each a card with a date and what happened. */
export function timelineSection(): Block[] {
  const step = (when: string, what: string): Block[] => [p(`**${when}**`), p(what)];
  return [
    ...sectionTitle('Timeline', 'How it happened, step by step.'),
    container({ layout: 'stack', gap: 3 }, [
      column(step('Step one', 'Where it started.'), 1, CARD),
      column(step('Step two', 'What changed along the way.'), 1, CARD),
      column(step('Step three', 'Where it stands today.'), 1, CARD),
    ]),
  ];
}

