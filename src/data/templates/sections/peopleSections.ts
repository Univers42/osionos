// The sections about people: what they say, who they are, and how to reach you.

import type { Block } from '@/entities/block';
import { h3, p, quote } from '../../seedBlockHelpers';
import { CARD, action, cardGrid, column, container, image, sectionTitle } from './sectionBlocks';

/** Quotes from people who used it, each with a name and a role. */
export function testimonialsSection(): Block[] {
  const voice = (words: string, who: string): Block[] => [quote(words), p(`**${who}**`)];
  return [
    ...sectionTitle('What people say', 'Short quotes read best: one or two sentences.'),
    cardGrid([
      voice('It saved us a week on the first project.', 'Alex · Designer'),
      voice('Clear, quick, and it just works.', 'Sam · Engineer'),
      voice('The first tool our whole team agreed on.', 'Robin · Team lead'),
    ], 3),
  ];
}

/** The team: a portrait, a name and a role per card. */
export function teamSection(): Block[] {
  const member = (name: string, role: string): Block[] => [image(`Portrait of ${name}`), h3(name), p(role)];
  return [
    ...sectionTitle('The team', 'Who is behind it.'),
    cardGrid([member('Name', 'Role'), member('Name', 'Role'), member('Name', 'Role'), member('Name', 'Role')], 4),
  ];
}

/** How to reach you: the channels on one side, a call to action on the other. */
export function contactSection(): Block[] {
  return [
    ...sectionTitle('Get in touch', 'Pick whichever way suits you.'),
    container({ layout: 'row', gap: 6, stackAt: 'mobile' }, [
      column([
        p('**Email** · [hello@example.com](mailto:hello@example.com)'),
        p('**Phone** · +00 000 000 000'),
        p('**Where** · City, Country'),
      ], 0.5),
      column([h3('Start a conversation'), p('Tell us what you need and we answer within a day.'), action('Write to us', 'primary', 'mailto:hello@example.com')], 0.5, CARD),
    ]),
  ];
}

/** A newsletter sign-up band. */
export function newsletterSection(): Block[] {
  return [
    container({ layout: 'row', gap: 6, align: 'center', stackAt: 'mobile', surface: 'subtle', padding: 6, radius: 'panel' }, [
      column([h3('Stay in the loop'), p('One email a month with what is new. No spam, unsubscribe any time.')], 0.7),
      column([action('Subscribe')], 0.3),
    ]),
  ];
}
