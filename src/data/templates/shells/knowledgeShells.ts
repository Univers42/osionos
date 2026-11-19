// Knowledge shells: pages people read to learn or find an answer — a blog index, a
// docs or wiki home, a knowledge base, an FAQ and a course.

import type { Block } from '@/entities/block';
import { bullet, callout, h2, h3, numbered, p, toggle } from '../../seedBlockHelpers';
import { postListSection } from '../sections/contentSections';
import { pageHeaderSection } from '../sections/frameSections';
import { faqSection } from '../sections/offerSections';
import { newsletterSection, testimonialsSection } from '../sections/peopleSections';
import { CARD, action, band, buttonPair, card, cardGrid, column, container, headingOf, image, portrait, sectionTitle } from '../sections/sectionBlocks';

/** The one post worth reading first, its picture beside the teaser. */
function featuredPost(): Block {
  return container({ layout: 'row', gap: 6, align: 'center', stackAt: 'tablet' }, [
    column([image('Featured post picture')], 0.55),
    column([p('*Featured · Date*'), h2('Title of your best post'), p('Two lines on why it is worth reading first.'), action('Read the post', 'secondary')], 0.45),
  ]);
}

export function blogIndexShell(): Block[] {
  return [...pageHeaderSection(), p('[All](#) · [Guides](#) · [News](#) · [Stories](#)'), featuredPost(), ...postListSection(), ...newsletterSection()];
}

/** Topic cards: the name, what it covers, and its first two pages. */
function topicCards(topics: [string, string][]): Block {
  return cardGrid(topics.map(([name, covers]) => [h3(name), p(covers), p('[First page](#) · [Second page](#)')]), 3);
}

/** A short list of linked pages under its heading. */
function pageList(title: string, pages: string[]): Block[] {
  return [h2(title), ...pages.map((page) => bullet(`[${page}](#)`))];
}

export function docsHomeShell(): Block[] {
  return [
    ...pageHeaderSection(),
    callout('New here? Start with Getting started, then pick a guide.', '👋'),
    topicCards([['Getting started', 'Install, set up and a first result.'], ['Guides', 'Step-by-step walk-throughs of common tasks.'], ['Reference', 'Every option, command and setting.'], ['Team', 'Who owns what, and how we work.'], ['Policies', 'The rules everyone follows.'], ['Glossary', 'The words we use, defined.']]),
    ...pageList('Popular pages', ['The page people open most', 'The second most read', 'A page new people need']),
    ...pageList('Recently updated', ['A page that changed this week', 'Another recent change']),
    callout('Something missing or wrong? Tell the page owner, or edit it yourself.', '✏️'),
  ];
}

export function knowledgeBaseShell(): Block[] {
  return [
    band([headingOf(1, 'How can we help?'), p('Browse a topic below, or ask us directly.'), action('Contact support', 'secondary')], { align: 'center', surface: 'subtle', padding: 8, radius: 'panel' }),
    topicCards([['Getting started', 'Your account and first steps.'], ['Billing', 'Plans, invoices and refunds.'], ['Troubleshooting', 'Fixes for common problems.']]),
    ...pageList('Popular articles', ['How to reset your password', 'How to change your plan', 'How to invite your team']),
    ...faqSection(),
    callout('Still stuck? Write to support and say what you tried: we answer within a day.', '🛟'),
  ];
}

/** Questions on one topic, each answer folded under it. */
function questionGroup(topic: string, questions: string[]): Block[] {
  return [h2(topic), ...questions.map((question) => toggle(question, [p('Answer in two or three sentences; link to the full page if there is more.')]))];
}

export function faqShell(): Block[] {
  return [
    ...pageHeaderSection(),
    ...questionGroup('General', ['What is it, in one sentence?', 'Who is it for?', 'How do I start?']),
    ...questionGroup('Account and billing', ['How do I change my plan?', 'How do I get an invoice?', 'How do I close my account?']),
    ...questionGroup('Privacy and security', ['Where is my data stored?', 'Who can see my content?']),
    callout('Did not find your question? Ask us and we add the answer here.', '💬'),
  ];
}

/** The course's modules, each folding its lessons. */
function curriculum(): Block[] {
  const courseModule = (title: string): Block => toggle(title, [numbered('First lesson · 10 min'), numbered('Second lesson · 15 min'), numbered('Practice · 20 min')]);
  return [...sectionTitle('Curriculum', 'What each module covers, lesson by lesson.'), courseModule('Module 1 · The basics'), courseModule('Module 2 · Going further'), courseModule('Module 3 · Your own project')];
}

/** Who teaches it: the portrait beside a short bio. */
function instructor(): Block {
  return container({ layout: 'row', gap: 6, align: 'center', stackAt: 'mobile' }, [
    column([portrait('Portrait of the instructor')], 0.25),
    column([h3('Taught by Your name'), p('Why you are the right person to teach this, in two lines.')], 0.75),
  ]);
}

export function courseShell(): Block[] {
  return [
    band([p('*Online course · Level · Length*'), headingOf(1, 'Course title'), p('What learners can do by the end that they cannot do today.'), buttonPair('Enrol now', 'Preview a lesson')], { padding: 8 }),
    image('Course trailer or cover picture'),
    cardGrid([card('12 lessons', 'Short and focused'), card('4 hours', 'At your own pace'), card('Beginner', 'No experience needed'), card('Certificate', 'When you finish')], 4, 10),
    ...sectionTitle('What you will learn', 'The skills, in plain words.'),
    container({ layout: 'row', gap: 4, stackAt: 'mobile' }, [
      column([bullet('A first skill'), bullet('A second skill')], 0.5, CARD), column([bullet('A third skill'), bullet('A fourth skill')], 0.5, CARD),
    ]),
    ...curriculum(), instructor(), ...testimonialsSection(), ...faqSection(),
  ];
}
