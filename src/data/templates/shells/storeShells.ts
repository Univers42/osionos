// Store and showcase shells: pages that show things to buy, eat or look at — a
// product, a catalogue, a restaurant, a recipe and a gallery.

import type { Block } from '@/entities/block';
import { bullet, callout, h2, h3, numbered, p, quote, todo, toggle } from '../../seedBlockHelpers';
import { gallerySection } from '../sections/contentSections';
import { bentoSection } from '../sections/featureSections';
import { footerSection, navSection, pageHeaderSection } from '../sections/frameSections';
import { faqSection } from '../sections/offerSections';
import { contactSection, newsletterSection, testimonialsSection } from '../sections/peopleSections';
import { CARD, action, buttonPair, card, cardGrid, column, container, headingOf, image, sectionTitle } from '../sections/sectionBlocks';

/** Products as cards: a picture, a name, a price line and one action each. */
function productGrid(names: string[]): Block {
  return cardGrid(names.map((name) => [image(`Photo of ${name}`), h3(name), p('Price · one line on what it is'), action('View', 'secondary')]), 4);
}

/** The product beside what it costs, what it is, and the two actions that buy or keep it. */
function productSummary(): Block {
  return container({ layout: 'row', gap: 8, stackAt: 'tablet' }, [
    column([image('Main product photo')], 0.55),
    column([
      p('*Category*'), headingOf(1, 'Product name'), headingOf(2, 'Price'),
      p('What it is and who it is for, in two sentences.'),
      bullet('The detail people ask about first'), bullet('What it is made of'), bullet('Size, weight or what is in the box'),
      buttonPair('Add to cart', 'Save for later'),
    ], 0.45),
  ]);
}

export function productShell(): Block[] {
  return [
    ...navSection(), productSummary(),
    toggle('Details', [p('Materials, dimensions and care.')]),
    toggle('Delivery and returns', [p('How long delivery takes, what it costs, and how to send it back.')]),
    ...testimonialsSection(),
    ...sectionTitle('You may also like', 'Products that go with this one.'), productGrid(['Product one', 'Product two', 'Product three', 'Product four']),
    ...faqSection(), ...footerSection(),
  ];
}

export function catalogueShell(): Block[] {
  return [
    ...navSection(), ...pageHeaderSection(),
    p('[All](#) · [New](#) · [Bestsellers](#) · [On sale](#)'),
    productGrid(['Product one', 'Product two', 'Product three', 'Product four']),
    productGrid(['Product five', 'Product six', 'Product seven', 'Product eight']),
    callout('Free delivery over a set amount, and returns within 30 days.', '📦'),
    ...newsletterSection(), ...footerSection(),
  ];
}

/** One course of the menu: its dishes, each with a price and what is in it. */
function menuCourse(course: string): Block[] {
  const dish = (name: string): Block => p(`**${name}** · Price — what is in it, in a few words.`);
  return [h3(course), dish('Dish name'), dish('Dish name'), dish('Dish name')];
}

/** Opening hours beside the address and the way there. */
function visitUs(): Block {
  return container({ layout: 'row', gap: 6, stackAt: 'mobile' }, [
    column([h3('Opening hours'), p('**Tuesday – Friday** · 12:00 – 22:00'), p('**Saturday – Sunday** · 11:00 – 23:00'), p('**Monday** · Closed')], 0.5, CARD),
    column([h3('Find us'), p('Street and number, City'), p('+00 000 000 000'), action('Get directions', 'secondary')], 0.5, CARD),
  ]);
}

export function restaurantShell(): Block[] {
  return [
    ...navSection(),
    container({ layout: 'row', gap: 8, align: 'center', stackAt: 'tablet' }, [
      column([headingOf(1, 'Your restaurant'), p('The cuisine, the mood and what people come back for.'), buttonPair('Book a table', 'See the menu')], 0.5),
      column([image('Your dining room or signature dish')], 0.5),
    ]),
    ...sectionTitle('Menu', 'Seasonal, and changed when the market does.'),
    cardGrid([menuCourse('Starters'), menuCourse('Mains'), menuCourse('Desserts')], 3),
    ...gallerySection(), ...testimonialsSection(), visitUs(), ...footerSection(),
  ];
}

/** What goes in, ticked off as you shop, beside how to make it, step by step. */
function recipeBody(): Block {
  return container({ layout: 'row', gap: 6, stackAt: 'tablet' }, [
    column([h2('Ingredients'), todo('200 g of the main ingredient'), todo('2 of something'), todo('A pinch of salt')], 0.4, CARD),
    column([h2('Method'), numbered('Prepare: what to chop, weigh or heat first.'), numbered('Cook: how long, how hot, and how to tell it is done.'), numbered('Serve: how to plate it, and with what.')], 0.6),
  ]);
}

export function recipeShell(): Block[] {
  return [
    p('*Course · Cuisine*'), headingOf(1, 'Recipe name'), p('Two lines on why this recipe works and when to make it.'),
    image('The finished dish'),
    cardGrid([card('Prep', '15 min'), card('Cook', '30 min'), card('Serves', '4'), card('Level', 'Easy')], 4),
    recipeBody(),
    callout('A tip that makes the difference, or a swap for a missing ingredient.', '👩‍🍳'),
    h2('Notes'), p('How to store it, and how long it keeps.'),
  ];
}

export function galleryShell(): Block[] {
  return [
    ...pageHeaderSection(), image('A lead picture, full width'), ...gallerySection(), ...bentoSection(),
    quote('A line about the work, or what you were looking for.'), ...contactSection(),
  ];
}
