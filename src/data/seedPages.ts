/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seedPages.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/10 14:41:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type { SeedPage } from './seedBlockHelpers';

import type { SeedPage } from './seedBlockHelpers';
import { getCollectionEmojiValue } from '@/shared/lib/markengine/uiCollectionAssets';
import {
  h1, h2, p, bullet, numbered, code, callout, divider,
} from './seedBlockHelpers';

import {
  gettingStarted, projectRoadmap, meetingNotes, dylanTasksDatabase, dylanProjectsDatabase,
} from './seedAdminPages';
import {
  designSystem, sprintReview, alexTasksDatabase, quickNotes, readingList, samTasksDatabase,
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
  icon: getCollectionEmojiValue('brain'),
  workspaceId: SHARED_WORKSPACE_ID,
  ownerId: 'mock-user-0',
  visibility: 'public',
  content: [
    h1('Team Wiki'),
    p('Shared knowledge base for the whole team.'),
    divider(),
    h2('Onboarding'),
    p('Welcome to the team! Here\'s what you need to know:'),
    numbered('Clone the repo and stay on the Docker-only workflow'),
    numbered('Generate runtime env files with Dockerized Node'),
    numbered('Run docker compose up -d --build from the repository root'),
    numbered('Open http://localhost:4322 and sign in to reach osionos'),
    callout('The normal flow starts at the website and opens this workspace through the bridge.', getCollectionEmojiValue('idea')),
    h2('Architecture'),
    p('The project has two main parts:'),
    bullet('src/ — The main osionos database system (components, stores, types)'),
    bullet('playground/ — A standalone Vite app for UI development and testing'),
    code('osionos-database-sys/\n├── src/           # Main project\n│   ├── components/  # React components\n│   ├── store/       # Zustand stores\n│   ├── types/       # TypeScript types\n│   └── lib/         # Engine, formula, markdown, syntax\n├── playground/    # Playground app\n│   └── src/\n│       ├── components/sidebar/  # osionos sidebar\n│       ├── store/               # Page & user stores\n│       └── data/                # Seed data\n└── packages/api/  # Fastify backend', 'plaintext'),
    h2('Useful commands'),
    code('# Generate runtime files\ndocker run --rm -v "$PWD":/workspace -w /workspace node:22-alpine node infrastructure/baas/scripts/bootstrap-env.mjs\ndocker run --rm -v "$PWD":/workspace -w /workspace node:22-alpine node infrastructure/baas/scripts/ensure-osionos-runtime-secrets.mjs\n\n# Start everything\ndocker compose up -d --build\n\n# Check services\ndocker compose ps', 'bash'),
  ],
};

/** All seed pages for offline playground mode. */
export const SEED_PAGES: SeedPage[] = [
  // Admin
  gettingStarted,
  projectRoadmap,
  meetingNotes,
  dylanTasksDatabase,
  dylanProjectsDatabase,
  // Alex
  designSystem,
  sprintReview,
  alexTasksDatabase,
  // Sam
  quickNotes,
  readingList,
  samTasksDatabase,
  // Shared
  teamWiki,
];

/** Returns seed pages matching the given workspace ID. */
export function seedPagesForWorkspace(wsId: string): SeedPage[] {
  return SEED_PAGES.filter(p => p.workspaceId === wsId);
}
