// The sections that ask for a decision: call to action, pricing and FAQ.

import type { Block } from '@/entities/block';
import { bullet, h3, p, toggle } from '../../seedBlockHelpers';
import { action, buttonPair, cardGrid, column, container, headingOf, sectionTitle } from './sectionBlocks';

/** One clear ask on its own band. */
export function ctaSection(): Block[] {
  return [
    container({ layout: 'stack', gap: 4, align: 'center', surface: 'accent', padding: 8, radius: 'panel' }, [
      column([
        headingOf(2, 'Ready to start?'),
        p('One sentence on what happens when they click.'),
        buttonPair('Start now', 'Talk to us'),
      ], 1),
    ]),
  ];
}

/** Plans side by side: a price, what is included, and one action each. */
export function pricingSection(): Block[] {
  const plan = (name: string, price: string, points: string[]): Block[] => [
    h3(name), headingOf(1, price), ...points.map((point) => bullet(point)), action(`Choose ${name}`),
  ];
  return [
    ...sectionTitle('Pricing', 'Simple plans. Change or cancel any time.'),
    cardGrid([
      plan('Starter', 'Free', ['One project', 'Community help']),
      plan('Pro', '$12 / month', ['Unlimited projects', 'Priority help', 'Custom domain']),
      plan('Team', '$40 / month', ['Everything in Pro', 'Up to 10 people', 'Shared workspace']),
    ], 3),
  ];
}

/** Common questions, each answer folded under its question. */
export function faqSection(): Block[] {
  const qa = (question: string, answer: string): Block => toggle(question, [p(answer)]);
  return [
    ...sectionTitle('Questions', 'The answers people ask for most.'),
    qa('How do I get started?', 'Say what the first step is and how long it takes.'),
    qa('What does it cost?', 'Point to the plans, or say it is free.'),
    qa('Can I cancel?', 'Say how, and what happens to their data.'),
    qa('Who do I ask for help?', 'Name the channel and the response time.'),
  ];
}

