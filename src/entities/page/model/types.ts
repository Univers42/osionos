/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: vjan-nie <vjan-nie@student.42madrid.com    +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/04/19 20:11:32 by vjan-nie         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, BlockType } from "@/entities/block";
import { StoreApi } from "zustand";
import { TemporalState } from "zundo";

/** Access model for page visibility. */
export type PageVisibility = "private" | "shared" | "public";

/** Collaborator permission on a page. */
export type PageCollaboratorRole = "viewer" | "editor" | "owner";

/** Explicit collaborator entry attached to a page. */
export interface PageCollaborator {
  userId: string;
  role: PageCollaboratorRole;
}

/** Entry representing a page in the workspace tree. */
export interface PageEntry {
  _id: string;
  title: string;
  icon?: string;
  /** Cover image URL or CSS gradient. */
  cover?: string;
  workspaceId: string;
  ownerId?: string | null;
  visibility?: PageVisibility;
  collaborators?: PageCollaborator[];
  parentPageId?: string | null;
  databaseId?: string | null;
  archivedAt?: string | null;
  /** Block content (only populated in offline/seed mode) */
  content?: Block[];
}

/** Discriminator for the type of page currently active. */
export type ActivePageKind = "page" | "database" | "home";

/** Currently selected page reference for the content panel. */
export interface ActivePage {
  id: string;
  workspaceId: string;
  kind: ActivePageKind;
  title?: string;
  icon?: string;
}

/** Subset of PageStore tracked in history */
export interface PageStoreHistory {
  pages: Record<string, PageEntry[]>;
  activePage: ActivePage | null;
  recents: ActivePage[];
}

export interface PageStore {
  pages: Record<string, PageEntry[]>; // keyed by workspaceId
  activePage: ActivePage | null;
  recents: ActivePage[]; // last 10 opened
  loadingIds: Set<string>; // workspaceIds currently fetching
  seeded: boolean; // true once seed data is loaded
  showTrash: boolean; // true when trash view is active

  fetchPages: (workspaceId: string, jwt: string) => Promise<void>;
  /** Fetch full page data (with content) from API */
  fetchPageContent: (pageId: string, jwt: string) => Promise<void>;
  /** Load seed pages into the store (call once after user store init) */
  seedOfflinePages: () => void;
  /** Seed pages to MongoDB via the API (online mode) */
  seedOnlinePages: (
    workspaceMap: Record<string, string>,
    jwt: string,
  ) => Promise<void>;
  openPage: (page: ActivePage) => void;
  addPage: (
    workspaceId: string,
    title: string,
    jwt: string,
    parentPageId?: string,
  ) => Promise<PageEntry | null>;
  duplicatePage: (
    pageId: string,
    workspaceId: string,
  ) => Promise<string | null>;
  movePage: (
    pageId: string,
    targetParentId: string | null,
    targetWorkspaceId: string,
  ) => void;
  deletePage: (
    pageId: string,
    workspaceId: string,
    jwt: string,
  ) => Promise<void>;
  restorePage: (
    pageId: string,
    workspaceId: string,
    jwt: string,
  ) => Promise<void>;
  permanentlyDeletePage: (
    pageId: string,
    workspaceId: string,
    jwt: string,
  ) => Promise<void>;
  clearWorkspace: (workspaceId: string) => void;
  setShowTrash: (show: boolean) => void;
  /** Force a manual snapshot of the current state into history (closes edit sessions) */
  forceHistorySnapshot: () => void;
  /** Access to zundo's temporal store for history management */
  temporal: StoreApi<TemporalState<PageStoreHistory>>;

  updateBlock: (
    pageId: string,
    blockId: string,
    updates: Partial<Block>,
  ) => void;
  insertBlock: (pageId: string, afterBlockId: string, block: Block) => void;
  deleteBlock: (pageId: string, blockId: string) => void;
  moveBlock: (
    pageId: string,
    blockId: string,
    targetIndex: number,
    parentBlockId?: string | null,
  ) => void;
  moveBlockAcrossTree: (
    pageId: string,
    blockId: string,
    targetParentBlockId: string | null,
    targetIndex: number,
  ) => void;
  indentBlock: (pageId: string, blockId: string) => void;
  outdentBlock: (pageId: string, blockId: string) => void;
  changeBlockType: (
    pageId: string,
    blockId: string,
    newType: BlockType,
  ) => void;
  updatePageContent: (pageId: string, blocks: Block[]) => void;
  updatePageTitle: (pageId: string, title: string) => void;

  // Selectors
  pagesForWorkspace: (workspaceId: string) => PageEntry[];
  rootPages: (workspaceId: string) => PageEntry[];
  childPages: (parentId: string, workspaceId: string) => PageEntry[];
  trashPages: (workspaceId: string) => PageEntry[];
  /** Get full page data including content (for rendering) */
  pageById: (pageId: string) => PageEntry | undefined;
}
