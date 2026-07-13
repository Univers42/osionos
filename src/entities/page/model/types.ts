/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   types.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/03 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/12 23:14:08 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { Block, BlockType } from "@/entities/block";

/** Access model for page visibility. */
export type PageVisibility = "private" | "shared" | "public";

/** Collaborator permission on a page. */
export type PageCollaboratorRole = "viewer" | "editor" | "owner";

/** Explicit collaborator entry attached to a page. */
export interface PageCollaborator {
  userId: string;
  role: PageCollaboratorRole;
}

export type PagePropertyType = "text" | "date" | "select" | "url" | "number" | "checkbox" | "relation" | "email" | "phone" | "person" | "multi_select" | "status";

/** How often a template auto-creates a new page (Notion "Duplicate every…"). */
export type PageRecurrenceEvery = "none" | "day" | "week" | "month";

/** Recurrence config persisted on a template page. The scheduler advances the markers. */
export interface PageRecurrence {
  every: PageRecurrenceEvery;
  /** ISO timestamp of the next due materialization (set when `every !== 'none'`). */
  nextDueAt?: string | null;
  /** ISO timestamp of the last materialization (idempotency marker). */
  lastRunAt?: string | null;
}

export interface PagePropertyEntry {
  key: string;
  label: string;
  type?: PagePropertyType;
  value: string | string[] | number | boolean | null;
  options?: string[];
  relationTarget?: "page" | "database" | "block" | "mixed";
}

/** Entry representing a page in the workspace tree. */
export interface PageEntry {
  _id: string;
  title: string;
  icon?: string;
  /** Cover image URL or CSS gradient. */
  cover?: string;
  /** Vertical focal point (%) of the cover image (CSS object-position); default 50 (centered). */
  coverPosition?: number;
  /** ISO timestamp of last modification (block edit, title change, etc.) */
  updatedAt?: string;
  workspaceId: string;
  ownerId?: string | null;
  visibility?: PageVisibility;
  collaborators?: PageCollaborator[];
  parentPageId?: string | null;
  /** Manual sibling order (durable; persisted to osionos_pages.sort_order). Lower = earlier. */
  sortOrder?: number | null;
  databaseId?: string | null;
  archivedAt?: string | null;
  /** Block content (only populated in offline/seed mode) */
  content?: Block[];
  /** Editable properties shown below the page title. */
  properties?: PagePropertyEntry[];
  /** Surface classification (agents, home). "folder" = a container that groups children, acts as a graph hub, and never opens on click (a file may also act as a folder). "wiki" = a governed knowledge root: groups children like a folder but OPENS onto its own index content; articles inside carry governance properties (owner, status, verified, domain). "code" = an IDE / Dev-Mode source file: line-based, rendered by the CodeMirror editor (not the block editor), body stored as a single `code` block. */
  surface?: "page" | "agent" | "home" | "folder" | "wiki" | "app" | "code";
  /** Local version for generated home dashboard content. */
  homeDashboardVersion?: number;
  /** True when this page is a database template (hidden from the normal tree/records). */
  isTemplate?: boolean;
  /** True when this template is the default used by the "New" button (one per workspace). */
  isDefaultTemplate?: boolean;
  /** Admin shell surface this template authors (profile / marketplace-app), so a
   *  shell can resolve "the template for surface X" instead of a hard-coded id. */
  templateSurface?: "profile" | "marketplace-app";
  /** Recurrence config — only meaningful on a template page. */
  recurrence?: PageRecurrence | null;
}

/** Discriminator for the type of page currently active. */
export type ActivePageKind = "page" | "database" | "home" | "channel";

/** Currently selected page reference for the content panel. */
export interface ActivePage {
  id: string;
  workspaceId: string;
  kind: ActivePageKind;
  title?: string;
  icon?: string;
  cover?: string;
  coverPosition?: number;
  databaseId?: string | null;
}

export interface PageIndexEntry {
  workspaceId: string;
  index: number;
}

export interface PageStore {
  pages: Record<string, PageEntry[]>; // keyed by workspaceId
  pageIdsByWorkspace: Record<string, string[]>; // stable ID lists keyed by workspaceId
  pagesIndex: Record<string, PageIndexEntry>; // O(1) page lookup index
  pageRevisions: Record<string, number>; // monotonically increments per page mutation
  activePage: ActivePage | null;
  navigationPath: ActivePage[]; // breadcrumb path based on navigation history
  recents: ActivePage[]; // last 10 opened
  loadingIds: Set<string>; // workspaceIds currently fetching
  seeded: boolean; // true once seed data is loaded
  showTrash: boolean; // true when archived files view is active

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
    options?: AddPageOptions,
  ) => Promise<PageEntry | null>;
  addDatabasePage: (
    workspaceId: string,
    title: string,
    jwt: string,
    databaseId: string,
    parentPageId?: string,
  ) => Promise<PageEntry | null>;
  duplicatePage: (
    pageId: string,
    workspaceId: string,
  ) => Promise<string | null>;
  /** Create a new template page (isTemplate=true) and open it for editing. */
  addTemplate: (
    workspaceId: string,
    jwt: string,
    options?: { title?: string; icon?: string },
  ) => Promise<PageEntry | null>;
  /** Mark one template as the workspace default, clearing any previous default. */
  setDefaultTemplate: (templateId: string, workspaceId: string) => void;
  /** Instantiate a new page from a template's content (placeholders reset); opens it unless options.open===false. */
  createPageFromTemplate: (
    templateId: string,
    workspaceId: string,
    jwt: string,
    parentPageId?: string,
    options?: { open?: boolean },
  ) => Promise<PageEntry | null>;
  /** Persist a template's recurrence config. */
  patchTemplateRecurrence: (
    templateId: string,
    recurrence: PageRecurrence,
  ) => void;
  archivePage: (
    pageId: string,
    workspaceId: string,
    jwt: string,
  ) => Promise<void>;
  movePage: (
    pageId: string,
    targetParentId: string | null,
    targetWorkspaceId: string,
  ) => void;
  /** Reposition a page directly before/after a sibling (same-level reorder, or
   *  reparent-and-place when the sibling lives elsewhere). Order lives in the
   *  page array and is cached to localStorage (the BaaS has no order column yet). */
  reorderSibling: (
    pageId: string,
    targetSiblingId: string,
    placeBefore: boolean,
    workspaceId: string,
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
  patchPage: (
    pageId: string,
    patch: Partial<PageEntry> | ((page: PageEntry) => Partial<PageEntry>),
  ) => void;
  updatePageTitle: (pageId: string, title: string) => void;

  // Selectors
  pagesForWorkspace: (workspaceId: string) => PageEntry[];
  rootPages: (workspaceId: string) => PageEntry[];
  childPages: (parentId: string, workspaceId: string) => PageEntry[];
  archivedPages: (workspaceId: string) => PageEntry[];
  /** All template pages in a workspace (isTemplate, not archived, readable). */
  templatePages: (workspaceId: string) => PageEntry[];
  /** The workspace's default template, if one is set. */
  defaultTemplate: (workspaceId: string) => PageEntry | undefined;
  /** The template authoring a given admin shell surface, if one exists. */
  templatePageBySurface: (workspaceId: string, surface: NonNullable<PageEntry["templateSurface"]>) => PageEntry | undefined;
  /** Get full page data including content (for rendering) */
  pageById: (pageId: string) => PageEntry | undefined;
}

export interface AddPageOptions {
  visibility?: PageVisibility;
  icon?: string;
  content?: Block[];
  surface?: PageEntry["surface"];
  isTemplate?: boolean;
  isDefaultTemplate?: boolean;
  templateSurface?: PageEntry["templateSurface"];
  recurrence?: PageRecurrence | null;
}
