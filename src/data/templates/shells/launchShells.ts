// Launch shells: pages that announce something and ask for one step — a product
// launch, an app landing page, a webinar, a newsletter and a coming-soon page.

import type { Block } from '@/entities/block';
import { bullet, h2, h3, p } from '../../seedBlockHelpers';
import { postListSection } from '../sections/contentSections';
import { bentoSection, featureGridSection, logoCloudSection, statsSection } from '../sections/featureSections';
import { footerSection, navSection } from '../sections/frameSections';
import { ctaSection, faqSection } from '../sections/offerSections';
import { newsletterSection, teamSection, testimonialsSection } from '../sections/peopleSections';
import { CARD, action, band, buttonPair, card, cardGrid, column, container, headingOf, image, sectionTitle } from '../sections/sectionBlocks';

/** A centred opening band: an eyebrow, the title, a lead and what comes after. */
function announcement(eyebrow: string, title: string, lead: string, then: Block[]): Block {
  return band([p(`*${eyebrow}*`), headingOf(1, title), p(lead), ...then], { align: 'center', padding: 8 });
}

export function productLaunchShell(): Block[] {
  return [
    ...navSection(),
    announcement('New · Your launch date', 'Introducing your product', 'The problem it solves and who it is for, in two sentences.', [
      buttonPair('Get early access', 'Watch the demo'),
    ]),
    image('Product screenshot or launch video'),
    ...featureGridSection(), ...bentoSection(), ...testimonialsSection(), ...faqSection(), ...ctaSection(), ...footerSection(),
  ];
}

/** Three steps from first look to first result. */
function howItWorks(steps: [string, string][]): Block[] {
  return [...sectionTitle('How it works', 'Three steps, start to finish.'), cardGrid(steps.map(([title, body]) => card(title, body)), 3)];
}

export function appLandingShell(): Block[] {
  const stores = (): Block => buttonPair('Download on the App Store', 'Get it on Google Play');
  return [
    ...navSection(),
    container({ layout: 'row', gap: 8, align: 'center', stackAt: 'tablet' }, [
      column([headingOf(1, 'Your app, in one line'), p('What it helps people do, and why it belongs on their phone.'), stores()], 0.55),
      column([image('App screenshot on a phone')], 0.45),
    ]),
    ...logoCloudSection(), ...featureGridSection(),
    ...howItWorks([['1 · Download', 'Free on iOS and Android.'], ['2 · Set up', 'What the first minute looks like.'], ['3 · Enjoy', 'The result people get on day one.']]),
    ...statsSection(), ...testimonialsSection(),
    band([h2('Get the app'), p('One line on why today is a good day to start.'), stores()], { align: 'center', surface: 'accent', padding: 8, radius: 'panel' }),
    ...footerSection(),
  ];
}

/** What the session covers, beside the card that registers for it. */
function webinarAgenda(): Block {
  return container({ layout: 'row', gap: 6, stackAt: 'tablet' }, [
    column([h2('What you will learn'), bullet('The first thing attendees take away.'), bullet('The second, kept as concrete.'), bullet('The third, and who it helps.')], 0.6),
    column([h3('Save your seat'), p('Free. Everyone who registers gets the recording.'), action('Register')], 0.4, CARD),
  ]);
}

export function webinarShell(): Block[] {
  return [
    announcement('Live webinar · Day, date · Time and time zone', 'Webinar title', 'Who it is for and the question it answers.', [action('Register for free')]),
    cardGrid([card('Date', 'Day and date'), card('Time', 'Start time and time zone'), card('Length', '45 minutes and questions')], 3, 12),
    webinarAgenda(), ...teamSection(), ...faqSection(),
    band([h3('Cannot make it live?'), p('Register anyway: the recording lands in your inbox the next day.'), action('Get the recording', 'secondary')], { align: 'center', padding: 6 }),
  ];
}

export function newsletterShell(): Block[] {
  return [
    announcement('A newsletter by Your name', 'Newsletter name', 'What readers get, how often, and why it is worth a place in their inbox.', [action('Subscribe')]),
    cardGrid([card('Every Friday', 'When it arrives'), card('5 minutes', 'How long it takes to read'), card('2,000+', 'Readers so far')], 3, 10),
    ...testimonialsSection(),
    ...postListSection(),
    ...newsletterSection(),
  ];
}

export function comingSoonShell(): Block[] {
  return [
    announcement('Your brand', 'Something new is coming', 'One line on what it is, and the day or season it opens.', [
      cardGrid([card('12', 'Days'), card('08', 'Hours'), card('30', 'Minutes')], 3, 10),
      action('Notify me'),
    ]),
    ...newsletterSection(),
    p('*Follow along: [Instagram](#) · [LinkedIn](#) · [Your site](#)*'),
  ];
}
