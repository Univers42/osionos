/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   pageStore.types.ts                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/05 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, BlockType } from '@src/types/database';

/** Entry representing a page in the workspace tree. */
export interface PageEntry {
  _id: string;
  title: string;
  icon?: string;
  workspaceId: string;
  parentPageId?: string | null;
  databaseId?: string | null;
  archivedAt?: string | null;
  /** Block content (only populated in offline/seed mode) */
  content?: Block[];
}

/** Discriminator for the type of page currently active. */
export type ActivePageKind = 'page' | 'database' | 'home';

/** Currently selected page reference for the content panel. */
export interface ActivePage {
  id: string;
  workspaceId: string;
  kind: ActivePageKind;
  title?: string;
  icon?: string;
}

export interface PageStore {
  pages: Record<string, PageEntry[]>;           // keyed by workspaceId
  activePage: ActivePage | null;
  recents: ActivePage[];                         // last 10 opened
  loadingIds: Set<string>;                       // workspaceIds currently fetching
  seeded: boolean;                                // true once seed data is loaded

  fetchPages: (workspaceId: string, jwt: string) => Promise<void>;
  /** Fetch full page data (with content) from API */
  fetchPageContent: (pageId: string, jwt: string) => Promise<void>;
  /** Load seed pages into the store (call once after user store init) */
  seedOfflinePages: () => void;
  /** Seed pages to MongoDB via the API (online mode) */
  seedOnlinePages: (workspaceMap: Record<string, string>, jwt: string) => Promise<void>;
  openPage: (page: ActivePage) => void;
  addPage: (workspaceId: string, title: string, jwt: string, parentPageId?: string) => Promise<PageEntry | null>;
  deletePage: (pageId: string, workspaceId: string, jwt: string) => Promise<void>;
  clearWorkspace: (workspaceId: string) => void;

  updateBlock: (pageId: string, blockId: string, updates: Partial<Block>) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  deleteBlock: (pageId: string, blockId: string) => void;
  moveBlock: (pageId: string, blockId: string, targetIndex: number, parentBlockId?: string | null) => void;
  indentBlock: (pageId: string, blockId: string) => void;
  outdentBlock: (pageId: string, blockId: string) => void;
  changeBlockType: (pageId: string, blockId: string, newType: BlockType) => void;
  updatePageContent: (pageId: string, blocks: Block[]) => void;
  updatePageTitle: (pageId: string, title: string) => void;

  // Selectors
  pagesForWorkspace: (workspaceId: string) => PageEntry[];
  rootPages: (workspaceId: string) => PageEntry[];
  childPages: (parentId: string, workspaceId: string) => PageEntry[];
  /** Get full page data including content (for rendering) */
  pageById: (pageId: string) => PageEntry | undefined;
}
