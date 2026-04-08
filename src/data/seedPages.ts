/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seedPages.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 01:31:17 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type { SeedPage } from './seedBlockHelpers';

import type { SeedPage } from './seedBlockHelpers';
import {
  h1, h2, p, bullet, numbered, code, callout, divider,
} from './seedBlockHelpers';

import { gettingStarted, projectRoadmap, meetingNotes } from './seedAdminPages';
import {
  designSystem, sprintReview, quickNotes, readingList,
} from './seedUserPages';

/** Mock workspace ID for the shared team workspace. */
export const SHARED_WORKSPACE_ID = 'mock-ws-shared-team';
/** Mock workspace definition for the shared team workspace. */
export const SHARED_WORKSPACE = {
  _id: SHARED_WORKSPACE_ID,
  name: 'Team Workspace',
  slug: 'team',
  ownerId: 'mock-user-0', // admin owns it
};

const teamWiki: SeedPage = {
  _id: 'page-shared-wiki',
  title: 'Team Wiki',
  icon: '📖',
  workspaceId: SHARED_WORKSPACE_ID,
  content: [
    h1('Team Wiki'),
    p('Shared knowledge base for the whole team.'),
    divider(),
    h2('Onboarding'),
    p('Welcome to the team! Here\'s what you need to know:'),
    numbered('Clone the repo and run pnpm install'),
    numbered('Copy .env.example to .env'),
    numbered('Run make dev-all to start both the API and playground'),
    numbered('Open http://localhost:3001 in your browser'),
    callout('If the API isn\'t running, the playground falls back to offline mode with seed data.', 'ℹ️'),
    h2('Architecture'),
    p('The project has two main parts:'),
    bullet('src/ — The main Notion database system (components, stores, types)'),
    bullet('playground/ — A standalone Vite app for UI development and testing'),
    code('notion-database-sys/\n├── src/           # Main project\n│   ├── components/  # React components\n│   ├── store/       # Zustand stores\n│   ├── types/       # TypeScript types\n│   └── lib/         # Engine, formula, markdown, syntax\n├── playground/    # Playground app\n│   └── src/\n│       ├── components/sidebar/  # Notion sidebar\n│       ├── store/               # Page & user stores\n│       └── data/                # Seed data\n└── packages/api/  # Fastify backend', 'plaintext'),
    h2('Useful commands'),
    code('# Start everything\nmake dev-all\n\n# Just the playground (offline mode)\ncd playground && make dev\n\n# Type check\nnpx tsc --noEmit\n\n# Run tests\npnpm test', 'bash'),
  ],
};

/** All seed pages for offline playground mode. */
export const SEED_PAGES: SeedPage[] = [
  // Admin
  gettingStarted,
  projectRoadmap,
  meetingNotes,
  // Alex
  designSystem,
  sprintReview,
  // Sam
  quickNotes,
  readingList,
  // Shared
  teamWiki,
];

/** Returns seed pages matching the given workspace ID. */
export function seedPagesForWorkspace(wsId: string): SeedPage[] {
  return SEED_PAGES.filter(p => p.workspaceId === wsId);
}
