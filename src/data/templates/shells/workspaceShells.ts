// Workspace shells: pages a person or a team works from — a personal home, a
// dashboard, a roadmap, meeting notes and a 404 page.

import type { Block } from '@/entities/block';
import { bullet, callout, divider, h2, h3, numbered, p, todo } from '../../seedBlockHelpers';
import { timelineSection } from '../sections/contentSections';
import { statsSection } from '../sections/featureSections';
import { pageHeaderSection } from '../sections/frameSections';
import { band, buttonPair, card, cardGrid, headingOf, sectionTitle } from '../sections/sectionBlocks';

export function personalHomeShell(): Block[] {
  return [
    headingOf(1, 'Welcome back, Your name'), p('*One line that sets the tone for the week.*'),
    cardGrid([
      [h3('Today'), todo('The one thing that matters most'), todo('A smaller task'), todo('Something for later')],
      [h3('Quick links'), bullet('[Calendar](#)'), bullet('[Inbox](#)'), bullet('[Projects](#)')],
      [h3('Notes'), p('Ideas and reminders you want to see first.')],
    ], 3),
    ...sectionTitle('Goals this month', 'Three at most, each with how you will know it is done.'),
    cardGrid([card('Goal one', 'Done when…'), card('Goal two', 'Done when…'), card('Goal three', 'Done when…')], 3),
    h2('Reading list'), todo('A book or article to read'), todo('Another one'),
    callout('A quote that keeps you going.', '🌱'),
  ];
}

/** One project's state at a glance: its status, owner and next date. */
function projectCard(name: string, status: string): Block[] {
  return [h3(name), p(`**Status** · ${status}`), p('Owner · Next milestone and its date')];
}

export function dashboardShell(): Block[] {
  return [
    headingOf(1, 'Dashboard'), p('*What this dashboard tracks · Updated every Monday*'),
    ...statsSection(),
    ...sectionTitle('Projects', 'Every project in flight, one card each.'),
    cardGrid([projectCard('Project one', 'On track'), projectCard('Project two', 'At risk'), projectCard('Project three', 'Done')], 3),
    ...sectionTitle('This week', 'What moved, and what needs a decision.'),
    cardGrid([[h3('Highlights'), bullet('A win worth sharing'), bullet('Another one')], [h3('Needs a decision'), bullet('The question, and who decides')]], 2),
    callout('Risks: what could slip, and what you are doing about it.', '⚠️'),
  ];
}

/** One column of the roadmap: its horizon and the items in it. */
function roadmapLane(title: string, hint: string): Block[] {
  return [h3(title), p(`*${hint}*`), bullet('An item, in the words of the people who asked for it'), bullet('Another item'), bullet('One more')];
}

export function roadmapShell(): Block[] {
  return [
    ...pageHeaderSection(),
    cardGrid([roadmapLane('Now', 'Being built this month'), roadmapLane('Next', 'Planned for the coming months'), roadmapLane('Later', 'Ideas we are exploring')], 3),
    callout('How we decide: what we weigh, and how to suggest something.', '🧭'),
    ...timelineSection(),
  ];
}

export function meetingNotesShell(): Block[] {
  return [
    headingOf(1, 'Meeting title'),
    cardGrid([card('Date', 'Day, date and time'), card('Attendees', 'Who was there'), card('Goal', 'What this meeting decides')], 3),
    h2('Agenda'), numbered('First topic · who leads it'), numbered('Second topic'), numbered('Any other business'),
    h2('Notes'), bullet('What was said that matters later.'),
    h2('Decisions'), callout('What was decided, and why.', '✅'),
    h2('Action items'), todo('A task · owner · due date'), todo('Another task · owner · due date'),
    divider(), p('*Next meeting: day, date and time*'),
  ];
}

export function notFoundShell(): Block[] {
  return [
    band([
      headingOf(1, '404'), h2('This page is not here'), p('It may have moved, or the link has a typo.'),
      buttonPair('Go home', 'Contact us'),
    ], { align: 'center', padding: 10 }),
    ...sectionTitle('Maybe you were looking for', 'The pages people open most.'),
    cardGrid([card('Docs', 'Guides and reference.'), card('Blog', 'What is new.'), card('Help', 'Answers to common questions.')], 3),
  ];
}
