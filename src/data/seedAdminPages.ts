/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seedAdminPages.ts                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { SeedPage } from './seedBlockHelpers';
import {
  h1, h2, h3, p, bullet, numbered, todo, code,
  quote, callout, divider, toggle,
} from './seedBlockHelpers';

const adminWsId = 'mock-ws-private-0';

export const gettingStarted: SeedPage = {
  _id: 'page-admin-getting-started',
  title: 'Getting Started',
  icon: '🚀',
  workspaceId: adminWsId,
  content: [
    h1('Welcome to the Playground'),
    p('This is a local-first Notion clone playground. Everything runs in the browser — no backend required.'),
    divider(),
    h2('Quick overview'),
    p('The sidebar mirrors the real Notion layout. You can navigate pages, create new ones, and switch between users.'),
    callout('This playground uses the exact same Block rendering pipeline as the main dashboard.', '💡'),
    h2('What you can do'),
    bullet('Browse and open pages in the sidebar'),
    bullet('Create new pages via the + button'),
    bullet('Switch between 3 pre-defined user accounts'),
    bullet('See how different block types render'),
    divider(),
    h2('Block types supported'),
    p('The content you see here is stored as a JSON array of Block objects. Each block has a type, content, and optional metadata.'),
    h3('Text & headings'),
    p('Paragraphs, headings (H1–H6), bold, italic — the basics of any document.'),
    h3('Lists'),
    bullet('Bulleted lists like this one'),
    bullet('With multiple items'),
    numbered('Numbered items too'),
    numbered('In order'),
    h3('To-dos'),
    todo('Set up the playground', true),
    todo('Add seed data with blocks', true),
    todo('Test the block renderer'),
    todo('Build something cool'),
    h3('Code'),
    code('const greeting = "Hello from the Playground!";\nconsole.log(greeting);\n\n// Block content is just JSON\nconst block: Block = {\n  id: "abc123",\n  type: "paragraph",\n  content: "Some text here"\n};', 'typescript'),
    h3('Callouts & quotes'),
    callout('Callouts are great for drawing attention to important information.', '📌'),
    quote('"The best way to predict the future is to invent it." — Alan Kay'),
    h3('Toggles'),
    toggle('Click to expand this toggle', [
      p('Hidden content inside a toggle block. You can nest any kind of block here.'),
      bullet('Like list items'),
      bullet('Or anything else'),
    ]),
  ],
};

export const projectRoadmap: SeedPage = {
  _id: 'page-admin-roadmap',
  title: 'Project Roadmap',
  icon: '🗺️',
  workspaceId: adminWsId,
  content: [
    h1('Roadmap — Q2 2026'),
    p('This page tracks the high-level goals and milestones for the current quarter.'),
    divider(),
    h2('✅ Completed'),
    todo('MongoDB adapter for workspace CRUD', true),
    todo('PostgreSQL adapter for analytics queries', true),
    todo('Multi-user auth with JWT refresh tokens', true),
    todo('Sidebar redesign matching real Notion layout', true),
    divider(),
    h2('🔄 In progress'),
    todo('Offline-first page store with seed data'),
    todo('Block-based content rendering in playground'),
    todo('Drag-and-drop block reordering'),
    divider(),
    h2('📋 Planned'),
    todo('Real-time collaboration via WebSockets'),
    todo('Slash command menu in playground'),
    todo('Page cover images and custom icons'),
    todo('Database views (table, board, gallery)'),
    divider(),
    h2('Architecture notes'),
    p('The system uses a layered DBMS architecture:'),
    numbered('API layer (Fastify) handles auth and routing'),
    numbered('Service layer abstracts over MongoDB / PostgreSQL'),
    numbered('Store layer (Zustand) manages client state'),
    numbered('Component layer renders blocks and views'),
    code('// Simplified request flow\nclient → API route → service → adapter → DB\n                                          ↓\n                   Zustand store ← response ←', 'plaintext'),
    callout('The playground bypasses the API entirely — all data lives in Zustand stores in-memory.', 'ℹ️'),
  ],
};

export const meetingNotes: SeedPage = {
  _id: 'page-admin-meetings',
  title: 'Meeting Notes',
  icon: '📝',
  workspaceId: adminWsId,
  content: [
    h1('Weekly Sync — March 28'),
    p('Attendees: Dylan, Alex, Sam'),
    divider(),
    h2('Agenda'),
    numbered('Playground status update'),
    numbered('Block rendering progress'),
    numbered('Next steps'),
    divider(),
    h2('Discussion'),
    h3('Playground status'),
    p('The playground is now fully functional offline. Seed data provides realistic page content for testing.'),
    quote('"We should make sure each user sees different content in their private workspace." — Dylan'),
    h3('Block rendering'),
    p('We are reusing the Block type from the main project. The playground has its own lightweight renderer that supports all common block types.'),
    callout('Decision: Use read-only rendering for now, add editing later.', '✅'),
    h3('Action items'),
    todo('Dylan: Finalize seed data for all 3 users', true),
    todo('Alex: Review the design system page'),
    todo('Sam: Test the guest experience'),
    divider(),
    p('Next meeting: April 4, 2026'),
  ],
};
