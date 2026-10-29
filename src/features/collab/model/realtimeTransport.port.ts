/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   realtimeTransport.port.ts                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/26 14:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/26 14:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * The ONLY cross-client I/O abstraction the Shared-collaboration domain may
 * depend on (AOC §1.2/§5). The domain + the zustand collab slice import this
 * port and nothing else; exactly one adapter binds it to the grobase
 * realtime-agnostic WebSocket gateway. This file imports NO transport.
 *
 * DELIBERATELY ABSENT: any 'mouse'/'pointer'/'cursorMove' variant — mouse
 * position is never sent or rendered (AOC R-A1). Only the keyboard caret,
 * selection, focus, decaying activity, navigation, and durable-announce events
 * travel here. Validate every inbound frame at the boundary (R-P1) via
 * `validateCollabEvent` before it reaches a reducer or the render path.
 */

export type Unsubscribe = () => void;

export interface CaretState { blockId: string; offset: number; }
export interface SelectionRange { anchor: CaretState; focus: CaretState; }
export interface Anchor { blockId: string; offset?: number; }

/**
 * Presence as the gateway projects it. The workspace topic carries ONLY the
 * identity allow-list (`memberId`, `displayName`, `color`, `avatarRef?`,
 * `lastSeen`) — never a page id, route, caret, selection or focused element
 * (C501). The page topic (`collabpage:<pageId>`) carries the page-relative
 * fields, so "who is on which page" is learned from the page channel of the
 * page being viewed and never leaks through `collab:<workspace>`.
 */
export interface PresenceState {
  memberId: string;
  displayName: string;
  color: string;                 // assigned, WCAG-safe (AOC R-A8)
  avatarRef?: string;
  route?: string;                // page channel only
  caret?: CaretState | null;     // page channel only
  selection?: SelectionRange | null; // page channel only
  focusedElementId?: string | null;  // page channel only
  lastSeen: number;
}

export type ActivityKind =
  | 'clicked' | 'created-block' | 'deleted-block'
  | 'opened-panel' | 'navigated' | 'seeded-file' | 'note';

export type NoteOp = 'created' | 'resolved' | 'deleted';
export type FileOp = 'seeded' | 'removed';

/**
 * One last-writer-wins operation on a page's block tree (content plane). TWO
 * register kinds share (v, actor) tie-breaking: `put`/`del` write register
 * `b:<id>` (the block's own fields minus `children` + its `parentId`, a delete
 * being a tombstone), `order` writes register `o:<parentId|root>` (one parent's
 * ordered child-id list). `parentId: null` = the page's top level.
 */
export type BlockOp =
  | { k: 'put'; id: string; parentId: string | null; block: Record<string, unknown>; v: number }
  | { k: 'del'; id: string; v: number }
  | { k: 'order'; parentId: string | null; ids: string[]; v: number };

/**
 * Every realtime message is exactly one of these (AOC §5 + R-P1).
 *
 * Page-scoped events (`blocks`, `caret`, `selection`, `focus`, `note`, `file`,
 * `activity`, `nav`) MUST carry the `pageId` they concern and travel only on
 * that page's channel. The adapter stamps it on every outbound page event; the
 * receiver drops a frame whose `pageId` differs from the channel's page (C502).
 * Only `pages` rides the workspace topic (and carries no page id — C516).
 */
export type CollabEvent =
  | { t: 'caret';     actor: string; seq: number; pageId?: string; caret: CaretState }
  | { t: 'selection'; actor: string; seq: number; pageId?: string; range: SelectionRange | null }
  | { t: 'focus';     actor: string; seq: number; pageId?: string; elementId: string | null }
  | { t: 'activity';  actor: string; seq: number; pageId?: string; kind: ActivityKind; targetId: string }
  | { t: 'nav';       actor: string; seq: number; pageId?: string; route: string }
  | { t: 'note';      actor: string; seq?: number; pageId?: string; noteId: string; op: NoteOp; anchor: Anchor }
  | { t: 'file';      actor: string; seq?: number; pageId?: string; fileId: string; op: FileOp; name: string }
  // Content plane: block-tree registers for one page, folded by the pure engine
  // (model/blockSync.ts). Never a feed item; validated at the boundary.
  | { t: 'blocks';    actor: string; seq: number; pageId: string; ops: BlockOp[] }
  // A sidebar-tree nudge: "this workspace's page list changed" — receivers
  // re-hydrate it, which merges additively and never drops local work.
  | { t: 'pages';     actor: string; seq: number; workspaceId: string };

/** What a channel may carry: the workspace topic or one page's topic. */
export type ChannelScope = 'workspace' | 'page';

/** Receiver-side drop counters, exposed for tests (never console-spammed). */
export interface ChannelStats {
  droppedPageMismatch: number;
  droppedRateLimit: number;
  droppedWorkspacePageEvent: number;
  droppedPageTopicPagesEvent: number;
}

export interface SummonReq { kind: 'summon'; route: string; anchor?: Anchor; message?: string; }
export interface SummonRes { accepted: boolean; }

export interface RealtimeChannel {
  broadcast(event: CollabEvent): void;                                   // ephemeral, fire-and-forget
  onEvent(handler: (e: CollabEvent) => void): Unsubscribe;

  setPresence(patch: Partial<PresenceState>): void;                      // native TRACK (gateway-backed)
  onPresence(handler: (members: PresenceState[]) => void): Unsubscribe;

  request(target: string, req: SummonReq): Promise<SummonRes>;           // directed, consent-gated (synthesized)
  onRequest(handler: (from: string, req: SummonReq) => Promise<SummonRes>): Unsubscribe;

  /** Receiver-side drop counters (page mismatch, rate cap) for tests. */
  stats?: () => ChannelStats;

  leave(): void;                                                          // tears down every subscription
}

export interface RealtimeTransport {
  // authToken proves Shared-space membership; join is authorized server-side (AOC §1.6/§Sec1).
  join(spaceId: string, authToken: string): Promise<RealtimeChannel>;
}
