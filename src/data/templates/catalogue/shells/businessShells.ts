// Business shells: pages about who does the work and how to hire or join them —
// services, an agency, a case study, a team page and careers.

import type { Block } from '@/entities/block';
import { bullet, h2, h3, numbered, p, quote } from '@/data/seedBlockHelpers';
import { gallerySection, timelineSection } from '@/data/templates/sections/contentSections';
import { logoCloudSection, statsSection } from '@/data/templates/sections/featureSections';
import { footerSection, heroSection, navSection, pageHeaderSection } from '@/data/templates/sections/frameSections';
import { ctaSection, faqSection } from '@/data/templates/sections/offerSections';
import { contactSection, teamSection, testimonialsSection } from '@/data/templates/sections/peopleSections';
import { action, band, card, cardGrid, column, container, headingOf, image, sectionTitle } from '@/data/templates/sections/sectionBlocks';

/** What you can be hired for: one card per service, each with a price hint and an ask. */
function serviceCards(): Block[] {
  const service = (name: string): Block[] => [
    h3(name), p('What you deliver, for whom, and the result they get.'), p('*From a starting price · a typical length*'), action('Ask about it', 'secondary'),
  ];
  return [...sectionTitle('Services', 'What you can hire us for.'), cardGrid([service('Strategy'), service('Design'), service('Build')], 3)];
}

/** How an engagement runs, from first call to hand-over. */
function processSteps(): Block[] {
  const steps = [card('1 · Talk', 'A first call to understand the goal.'), card('2 · Plan', 'A written scope, a price and dates.'), card('3 · Deliver', 'Work in short rounds, shown as it goes.'), card('4 · Hand over', 'Everything you need to carry on.')];
  return [...sectionTitle('How we work', 'The same four steps on every project.'), cardGrid(steps, 4)];
}

export function servicesShell(): Block[] {
  return [
    ...navSection(),
    band([p('*Services*'), headingOf(1, 'What we do, in one line'), p('Who you help and the kind of problem you solve best.')], { padding: 8 }),
    ...serviceCards(), ...processSteps(), ...testimonialsSection(), ...faqSection(), ...contactSection(), ...footerSection(),
  ];
}

export function agencyShell(): Block[] {
  return [
    ...navSection(), ...heroSection(), ...logoCloudSection(), ...serviceCards(), ...gallerySection(),
    ...statsSection(), ...teamSection(), ...testimonialsSection(), ...ctaSection(), ...footerSection(),
  ];
}

/** The project at a glance: who, what, how long and the headline result. */
function caseFacts(): Block {
  return cardGrid([card('Client', 'Who it was for'), card('Role', 'What you did'), card('Timeline', 'How long it took'), card('Result', 'The headline number')], 4);
}

/** The story: the problem, what you did about it, and what changed. */
function caseStory(): Block[] {
  return [
    h2('The challenge'), p('What was wrong, for whom, and why it mattered now.'),
    h2('The approach'), numbered('The first thing you did, and why.'), numbered('What you tried next.'), numbered('What made the difference.'),
    h2('The result'), p('What changed, in numbers where you can.'),
    quote('A sentence from the client about working with you.'), p('**Client name** · Role, Company'),
  ];
}

export function caseStudyShell(): Block[] {
  return [...pageHeaderSection(), image('Project picture'), caseFacts(), ...caseStory(), ...gallerySection(), ...statsSection(), ...ctaSection()];
}

/** What the team believes in, one card each. */
function values(): Block[] {
  return [
    ...sectionTitle('What we value', 'The ideas we hold ourselves to.'),
    cardGrid([card('Care', 'Say what this value means in practice.'), card('Clarity', 'One sentence, no jargon.'), card('Courage', 'Swap these for your own.')], 3),
  ];
}

export function teamShell(): Block[] {
  return [
    ...pageHeaderSection(), ...teamSection(), ...values(), ...timelineSection(),
    band([h2('Want to join us?'), p('We are hiring. See the roles that are open.'), action('See open roles')], { align: 'center', surface: 'accent', padding: 8, radius: 'panel' }),
  ];
}

/** One open role: its title and terms, beside the action that applies. */
function opening(role: string, team: string): Block {
  return container({ layout: 'row', gap: 4, align: 'center', stackAt: 'mobile', surface: 'muted', padding: 5, radius: 'panel' }, [
    column([h3(role), p(`*${team} · Remote or city · Full time*`)], 0.75),
    column([action('Apply', 'secondary')], 0.25),
  ]);
}

export function careersShell(): Block[] {
  return [
    band([p('*Careers*'), headingOf(1, 'Do the best work of your life'), p('Why people join, and what makes the team different.'), action('See open roles')], { align: 'center', padding: 8 }),
    ...values(),
    ...sectionTitle('Benefits', 'What you get besides the work.'),
    cardGrid([[h3('Time'), bullet('Holidays and flexible hours')], [h3('Growth'), bullet('A budget to learn')], [h3('Health'), bullet('Cover for you and yours')]], 3),
    ...sectionTitle('Open roles', 'Do not see yours? Write to us anyway.'),
    opening('Role title', 'Team'), opening('Role title', 'Team'), opening('Role title', 'Team'),
    h2('How we hire'), numbered('A short call about you and the role.'), numbered('A task close to the real work.'), numbered('Meet the team, then an answer within a week.'),
    ...testimonialsSection(), ...contactSection(),
  ];
}
