// Site-style shells: whole pages composed from the section library.

import type { Block } from '@/entities/block';
import { h3, p } from '../../seedBlockHelpers';
import { contentSection, gallerySection, timelineSection } from '../sections/contentSections';
import { comparisonSection, featureGridSection, logoCloudSection, statsSection } from '../sections/featureSections';
import { footerSection, heroSection, navSection, pageHeaderSection } from '../sections/frameSections';
import { ctaSection, faqSection, pricingSection } from '../sections/offerSections';
import { contactSection, newsletterSection, teamSection, testimonialsSection } from '../sections/peopleSections';
import { CARD, action, cardGrid, column, container, sectionTitle } from '../sections/sectionBlocks';

export function landingShell(): Block[] {
  return [
    ...navSection(), ...heroSection(), ...logoCloudSection(), ...featureGridSection(), ...statsSection(),
    ...testimonialsSection(), ...pricingSection(), ...faqSection(), ...ctaSection(), ...footerSection(),
  ];
}

export function portfolioShell(): Block[] {
  return [...navSection(), ...heroSection(), ...gallerySection(), ...testimonialsSection(), ...contactSection(), ...footerSection()];
}

export function aboutShell(): Block[] {
  return [...pageHeaderSection(), ...contentSection(), ...statsSection(), ...timelineSection(), ...teamSection(), ...ctaSection()];
}

export function pricingShell(): Block[] {
  return [...pageHeaderSection(), ...pricingSection(), ...comparisonSection(), ...faqSection(), ...ctaSection()];
}

export function contactShell(): Block[] {
  return [...pageHeaderSection(), ...contactSection(), ...faqSection(), ...newsletterSection()];
}

/** The practical details of an event, one card each. */
function eventDetails(): Block[] {
  const detail = (title: string, body: string): Block[] => [h3(title), p(body)];
  return [
    ...sectionTitle('The details', 'Everything you need to plan your visit.'),
    cardGrid([detail('When', 'Day, date · start and end time'), detail('Where', 'Venue, street, city'), detail('Price', 'Free, or the ticket price')], 3),
  ];
}

export function eventShell(): Block[] {
  return [
    ...heroSection(), ...eventDetails(), ...timelineSection(), ...teamSection(), ...faqSection(),
    container({ layout: 'stack', gap: 3, align: 'center', padding: 6 }, [
      column([h3('Save your seat'), p('Places are limited.'), action('Register')], 1, CARD),
    ]),
  ];
}
