/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seedUserPages.ts                                   :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SeedPage } from './seedBlockHelpers';
import {
  h1, h2, h3, p, bullet, todo, code,
  quote, callout, divider, toggle,
} from './seedBlockHelpers';

const alexWsId = 'mock-ws-private-1';

export const designSystem: SeedPage = {
  _id: 'page-alex-design',
  title: 'Design System',
  icon: '🎨',
  workspaceId: alexWsId,
  content: [
    h1('Design System v2'),
    p('This document outlines the design tokens, component patterns, and visual guidelines for the project.'),
    divider(),
    h2('Color tokens'),
    p('We use CSS custom properties for all colors. This allows seamless light/dark theme switching.'),
    code(':root {\n  --color-ink:              #37352f;\n  --color-ink-muted:        #787774;\n  --color-ink-faint:        #b4b4b0;\n  --color-surface-primary:  #ffffff;\n  --color-surface-secondary:#f7f6f3;\n  --color-accent:           #2383e2;\n  --color-line:             #e9e9e7;\n}', 'css'),
    h2('Typography'),
    p('Base font: system-ui. We use a modular scale for heading sizes.'),
    bullet('H1: 2xl (24px), bold'),
    bullet('H2: xl (20px), semibold'),
    bullet('H3: lg (18px), semibold'),
    bullet('Body: sm (14px), normal'),
    bullet('Caption: xs (12px), muted'),
    h2('Component patterns'),
    h3('Sidebar nav items'),
    p('Each sidebar row is 30px tall, 6px border-radius, with a 22×22 icon slot.'),
    code('<SidebarNavItem\n  icon={<Home size={16} />}\n  label="Home"\n  active={true}\n  onClick={handleClick}\n/>', 'typescript'),
    h3('Callouts'),
    callout('Use callouts to highlight important info.', '💡'),
    callout('Warnings use a different emoji and color scheme.', '⚠️'),
    callout('Errors for critical blockers.', '❗'),
    divider(),
    h2('Dark mode'),
    p('All colors are defined via CSS variables. Toggle by applying a class to <html>:'),
    code('document.documentElement.classList.toggle("dark");', 'javascript'),
    toggle('Full dark mode token list', [
      code(':root.dark {\n  --color-ink:              #ffffffcf;\n  --color-ink-muted:        #ffffff73;\n  --color-surface-primary:  #191919;\n  --color-surface-secondary:#202020;\n  --color-accent:           #529cca;\n  --color-line:             #ffffff14;\n}', 'css'),
    ]),
  ],
};

export const sprintReview: SeedPage = {
  _id: 'page-alex-sprint',
  title: 'Sprint Review',
  icon: '🏃',
  workspaceId: alexWsId,
  content: [
    h1('Sprint 12 Review'),
    p('Sprint: March 18 — March 29, 2026'),
    divider(),
    h2('Velocity'),
    p('Completed 24 out of 28 story points (86%).'),
    callout('Best sprint velocity this quarter!', '🔥'),
    h2('Completed stories'),
    todo('Sidebar component redesign', true),
    todo('Workspace switcher with chevron dropdown', true),
    todo('Section headers with hover actions', true),
    todo('Page tree item with recursive expand', true),
    todo('Offline mock fallback for dev mode', true),
    h2('Carried over'),
    todo('Inline database views in page content'),
    todo('Slash command menu integration'),
    todo('Cover image upload support'),
    divider(),
    h2('Retrospective'),
    h3('What went well'),
    bullet('Fast delivery of sidebar components'),
    bullet('Clean separation between playground and main app'),
    bullet('Good use of existing block types'),
    h3('What to improve'),
    bullet('Need better error handling in offline mode'),
    bullet('Page content rendering should use the real Block pipeline'),
    quote('"Let\'s focus on rendering quality next sprint." — Alex'),
  ],
};


const samWsId = 'mock-ws-private-2';

export const quickNotes: SeedPage = {
  _id: 'page-sam-notes',
  title: 'Quick Notes',
  icon: '📋',
  workspaceId: samWsId,
  content: [
    h1('Quick Notes'),
    p('A place to jot down ideas and thoughts.'),
    divider(),
    h2('April 2026'),
    p('Started exploring the Notion playground. The offline mode works great!'),
    bullet('Sidebar looks exactly like the real Notion'),
    bullet('Block rendering is clean and readable'),
    bullet('User switching is instant'),
    divider(),
    h2('Ideas'),
    callout('What if we added a "Daily journal" template that auto-creates a page for each day?', '💡'),
    todo('Try building a personal dashboard'),
    todo('Explore the formula engine'),
    todo('Test database views when available'),
  ],
};

export const readingList: SeedPage = {
  _id: 'page-sam-reading',
  title: 'Reading List',
  icon: '📚',
  workspaceId: samWsId,
  content: [
    h1('Reading List'),
    p('Books and articles to check out.'),
    divider(),
    h2('Currently reading'),
    bullet('"Designing Data-Intensive Applications" — Martin Kleppmann'),
    p('Great deep-dive into distributed systems patterns. Relevant for our multi-DB adapter approach.'),
    h2('Up next'),
    bullet('"The Pragmatic Programmer" — Hunt & Thomas'),
    bullet('"Refactoring UI" — Wathan & Schoger'),
    bullet('"Algorithms to Live By" — Christian & Griffiths'),
    h2('Finished'),
    todo('"Clean Code" — Robert C. Martin', true),
    todo('"You Don\'t Know JS" — Kyle Simpson', true),
    todo('"Eloquent JavaScript" — Marijn Haverbeke', true),
    divider(),
    quote('"A reader lives a thousand lives before he dies. The man who never reads lives only one." — George R.R. Martin'),
  ],
};
