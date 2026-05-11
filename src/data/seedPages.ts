/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seedPages.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/11 16:05:15 by dlesieur         ###   ########.fr       */
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
    code('# Generate runtime files\ndocker run --rm -v "$PWD":/workspace -w /workspace node:22-alpine node apps/baas/scripts/bootstrap-env.mjs\ndocker run --rm -v "$PWD":/workspace -w /workspace node:22-alpine node apps/baas/scripts/ensure-osionos-runtime-secrets.mjs\n\n# Start everything\ndocker compose up -d --build\n\n# Check services\ndocker compose ps', 'bash'),
  ],
};

const containmentFixture: SeedPage = {
  _id: 'page-admin-cell-containment-fixture',
  title: 'Cell containment fixture',
  icon: 'icon:grid',
  workspaceId: 'mock-ws-private-0',
  ownerId: 'mock-user-0',
  content: [
    h1('Cell content containment'),
    p('Three adjacent layout cells for validating intrinsic-width block containment.'),
    {
      id: 'block-cell-containment-layout',
      type: 'layout',
      content: '',
      layoutMode: 'inline',
      layoutConfig: { columns: 12, rows: 3, gap: 16, rowHeight: 180, wrap: true, autoArrange: false, snapToGrid: true, guideVisibility: 'auto', preview: false },
      layoutCells: [
        {
          id: 'cell-containment-database',
          colStart: 1,
          colSpan: 3,
          rowStart: 1,
          rowSpan: 3,
          label: 'Database table',
          blocks: [{ id: 'block-containment-database', type: 'database_inline', content: '', databaseId: 'db-products', viewId: 'v-prod-table' }],
          sizing: 'fixed',
        },
        {
          id: 'cell-containment-table',
          colStart: 4,
          colSpan: 3,
          rowStart: 1,
          rowSpan: 3,
          label: 'Wide table',
          blocks: [{ id: 'block-containment-table', type: 'table_block', content: '', tableData: [
            ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'],
            ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'],
          ] }],
          sizing: 'fixed',
        },
        {
          id: 'cell-containment-copy',
          colStart: 7,
          colSpan: 6,
          rowStart: 1,
          rowSpan: 3,
          label: 'Nested paragraphs',
          blocks: [
            p('This wider cell should stay calm while the neighboring intrinsic-width blocks scroll inside their own content regions.'),
            p('The cell frame, selection ring, handle bar, and resize handles should remain tied to the layout cell, not the child content width.'),
          ],
          sizing: 'fixed',
        },
      ],
    },
  ],
};

/** All seed pages for offline playground mode. */
export const SEED_PAGES: SeedPage[] = [
  // Admin
  gettingStarted,
  projectRoadmap,
  meetingNotes,
  containmentFixture,
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
