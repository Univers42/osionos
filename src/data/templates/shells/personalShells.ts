// Personal and writing shells: profile, link-in-bio, resume, blog post, docs page
// and changelog.

import type { Block } from '@/entities/block';
import { bullet, callout, code, divider, h2, h3, p } from '../../seedBlockHelpers';
import { contentSection, postListSection } from '../sections/contentSections';
import { featureGridSection } from '../sections/featureSections';
import { pageHeaderSection } from '../sections/frameSections';
import { contactSection, newsletterSection } from '../sections/peopleSections';
import { CARD, action, buttonPair, cardGrid, column, container, headingOf, image, sectionTitle } from '../sections/sectionBlocks';

/** A round portrait slot. */
function avatar(): Block {
  return { ...image('Your portrait'), mediaShape: 'circle' };
}

/** Who you are: the portrait beside the name, a line and two actions. */
function identity(): Block {
  return container({ layout: 'row', gap: 6, align: 'center', stackAt: 'mobile' }, [
    column([avatar()], 0.25),
    column([headingOf(1, 'Your name'), p('What you do, where, and what you care about, in one line.'), buttonPair('Follow', 'Message')], 0.75),
  ]);
}

export function profileShell(): Block[] {
  return [identity(), divider(), ...featureGridSection(), ...postListSection(), ...contactSection()];
}

export function linkInBioShell(): Block[] {
  const links = ['My website', 'Latest project', 'Newsletter', 'Say hello'].map((label) => action(label, 'secondary'));
  return [
    container({ layout: 'stack', gap: 3, align: 'center', padding: 6 }, [
      column([avatar(), headingOf(2, 'Your name'), p('One line about you.'), ...links], 1),
    ]),
  ];
}

/** A role or a course: what, where, when, and what came of it. */
function entry(title: string, place: string, when: string): Block[] {
  return [h3(title), p(`*${place} · ${when}*`), bullet('What you did, and what changed because of it.')];
}

export function resumeShell(): Block[] {
  return [
    container({ layout: 'row', gap: 6, align: 'center', stackAt: 'mobile' }, [
      column([headingOf(1, 'Your name'), p('Your title · City · [email@example.com](mailto:email@example.com)')], 0.7),
      column([action('Download PDF', 'secondary')], 0.3),
    ]),
    h2('Experience'), ...entry('Role', 'Company', '2023 – now'), ...entry('Role', 'Company', '2020 – 2023'),
    h2('Education'), ...entry('Degree', 'School', '2016 – 2020'),
    h2('Skills'),
    cardGrid([[h3('Craft'), p('Your core skills.')], [h3('Tools'), p('What you work with.')], [h3('Languages'), p('What you speak.')]], 3, 10),
  ];
}

/** The author's card under a post. */
function authorCard(): Block {
  return container({ layout: 'row', gap: 4, align: 'center', stackAt: 'never' }, [
    column([avatar()], 0.2),
    column([h3('Written by Your name'), p('One line about the author.')], 0.8),
  ]);
}

export function blogPostShell(): Block[] {
  return [
    ...pageHeaderSection(), image('Post picture'), ...contentSection(), divider(),
    authorCard(), ...newsletterSection(), ...postListSection(),
  ];
}

export function docsShell(): Block[] {
  return [
    ...pageHeaderSection(),
    callout('What the reader needs before starting: versions, access, prerequisites.', 'ℹ️'),
    ...contentSection(),
    h2('Example'), code('const answer = 42;', 'typescript'),
    ...sectionTitle('Next steps', 'Where to go from here.'),
    cardGrid([[h3('Guide'), p('A deeper walk through.')], [h3('Reference'), p('Every option, listed.')]], 2),
  ];
}

/** One release: its version, date and what changed. */
function release(version: string, date: string): Block[] {
  return [
    h2(version), p(`*${date}*`),
    container({ layout: 'stack', gap: 2 }, [
      column([h3('Added'), bullet('A new thing people can do.'), h3('Fixed'), bullet('A problem that is gone.')], 1, CARD),
    ]),
  ];
}

export function changelogShell(): Block[] {
  return [...pageHeaderSection(), ...release('Version 1.1', 'March 2'), ...release('Version 1.0', 'February 1'), ...newsletterSection()];
}
